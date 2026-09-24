'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReadContract, useChainId, usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import type { V3Position, PositionWithTokens, PositionDetails } from '@/types/earn'
import { getAbi, getDexes } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import { TOKEN_LISTS } from '@/lib/tokens'
import { isPonderError } from '@/lib/ponder-client'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import { formatPoolPrice } from '@/lib/liquidity-helpers'
import {
    describePositions,
    type DescribedPosition,
    type PositionInput,
} from '@/services/liquidity/positions'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

function buildTokenMap(chainId: number, graduatedTokens: Token[]): Map<string, Token> {
    const map = new Map<string, Token>()
    const staticTokens = TOKEN_LISTS[chainId] ?? []
    for (const t of staticTokens) {
        map.set(t.address.toLowerCase(), t)
    }
    for (const t of graduatedTokens) {
        if (!map.has(t.address.toLowerCase())) {
            map.set(t.address.toLowerCase(), t)
        }
    }
    return map
}

function createPlaceholderToken(address: Address, chainId: number): Token {
    return {
        address,
        symbol: `${address.slice(0, 6)}...`,
        name: 'Unknown Token',
        decimals: 18,
        chainId,
    }
}

function decimalsMap(tokenMap: Map<string, Token>): Map<string, number> {
    const map = new Map<string, number>()
    for (const [address, token] of tokenMap) map.set(address, token.decimals)
    return map
}

function tokenFor(tokenMap: Map<string, Token>, address: string, chainId: number): Token {
    return (
        tokenMap.get(address.toLowerCase()) ?? createPlaceholderToken(address as Address, chainId)
    )
}

/**
 * The indexer only stores the fields needed to value a position; the mint-time bookkeeping
 * (nonce, operator, fee growth) is not indexed and is unused by the position UIs.
 */
function toV3Position(described: DescribedPosition): V3Position {
    return {
        tokenId: described.tokenId,
        nonce: 0n,
        operator: ZERO_ADDRESS,
        token0: described.token0 as Address,
        token1: described.token1 as Address,
        fee: described.fee,
        tickLower: described.tickLower,
        tickUpper: described.tickUpper,
        liquidity: described.liquidity,
        feeGrowthInside0LastX128: 0n,
        feeGrowthInside1LastX128: 0n,
        tokensOwed0: described.tokensOwed0,
        tokensOwed1: described.tokensOwed1,
    }
}

function toPositionWithTokens(
    described: DescribedPosition,
    tokenMap: Map<string, Token>,
    chainId: number
): PositionWithTokens {
    return {
        ...toV3Position(described),
        token0Info: tokenFor(tokenMap, described.token0, chainId),
        token1Info: tokenFor(tokenMap, described.token1, chainId),
        poolAddress: described.poolAddress,
        inRange: described.inRange,
        currentTick: described.currentTick,
        amount0: described.amount0,
        amount1: described.amount1,
        uncollectedFees0: described.uncollectedFees0,
        uncollectedFees1: described.uncollectedFees1,
    }
}

function toPositionDetails(
    described: DescribedPosition,
    tokenMap: Map<string, Token>,
    chainId: number
): PositionDetails {
    return {
        ...toPositionWithTokens(described, tokenMap, chainId),
        sqrtPriceX96: described.sqrtPriceX96,
        poolLiquidity: described.poolLiquidity,
        priceLower: formatPoolPrice(described.priceLower),
        priceUpper: formatPoolPrice(described.priceUpper),
        currentPrice: formatPoolPrice(described.currentPrice),
    }
}

interface DescribeOptions {
    chainId: number
    owner?: Address | undefined
    tokenIds?: bigint[] | undefined
    positions?: PositionInput[] | undefined
    enabled: boolean
    staleTime?: number
}

/**
 * One round trip per position view: the indexer rows, the factory/pool reads they imply and the
 * collect() fee simulation all resolve inside describePositions.
 */
function useDescribedPositions(options: DescribeOptions): {
    described: DescribedPosition[]
    isLoading: boolean
    refetch: () => void
} {
    const { chainId, owner, tokenIds, positions, enabled, staleTime = 30_000 } = options
    const publicClient = usePublicClient({ chainId })
    const { tokens: graduatedTokens } = useGraduatedTokens(chainId)
    const tokenMap = useMemo(
        () => buildTokenMap(chainId, graduatedTokens),
        [chainId, graduatedTokens]
    )
    const decimals = useMemo(() => decimalsMap(tokenMap), [tokenMap])

    const { data, isLoading, refetch } = useQuery({
        queryKey: [
            'described-positions',
            chainId,
            owner?.toLowerCase(),
            tokenIds?.map((id) => id.toString()).join(','),
            positions?.map((p) => p.tokenId.toString()).join(','),
        ],
        queryFn: async () => {
            if (!publicClient) return []
            try {
                return await describePositions(publicClient, {
                    chainId,
                    ...(owner ? { owner } : {}),
                    ...(tokenIds ? { tokenIds } : {}),
                    ...(positions ? { positions } : {}),
                    decimals,
                })
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: enabled && !!publicClient,
        staleTime,
    })

    return { described: data ?? [], isLoading, refetch }
}

function useTokenMap(chainId: number): Map<string, Token> {
    const { tokens: graduatedTokens } = useGraduatedTokens(chainId)
    return useMemo(() => buildTokenMap(chainId, graduatedTokens), [chainId, graduatedTokens])
}

export function useUserPositions(
    owner: Address | undefined,
    chainId?: number
): {
    positions: PositionWithTokens[]
    isLoading: boolean
    isError: boolean
    refetch: () => void
} {
    const currentChainId = useChainId()
    const effectiveChainId = chainId ?? currentChainId
    const tokenMap = useTokenMap(effectiveChainId)
    const { described, isLoading, refetch } = useDescribedPositions({
        chainId: effectiveChainId,
        owner,
        enabled: !!owner,
    })

    const positions = useMemo(
        () => described.map((p) => toPositionWithTokens(p, tokenMap, effectiveChainId)),
        [described, tokenMap, effectiveChainId]
    )

    return { positions, isLoading, isError: false, refetch }
}

export function usePositionsByTokenIds(
    tokenIds: bigint[],
    chainId?: number
): {
    positions: PositionWithTokens[]
    isLoading: boolean
    refetch: () => void
} {
    const currentChainId = useChainId()
    const effectiveChainId = chainId ?? currentChainId
    const tokenMap = useTokenMap(effectiveChainId)
    const { described, isLoading, refetch } = useDescribedPositions({
        chainId: effectiveChainId,
        tokenIds,
        enabled: tokenIds.length > 0,
    })

    const positions = useMemo(
        () => described.map((p) => toPositionWithTokens(p, tokenMap, effectiveChainId)),
        [described, tokenMap, effectiveChainId]
    )

    return { positions, isLoading, refetch }
}

export function usePositionDetails(
    tokenId: bigint | undefined,
    chainId?: number
): {
    position: PositionDetails | null
    isLoading: boolean
    refetch: () => void
} {
    const currentChainId = useChainId()
    const effectiveChainId = chainId ?? currentChainId
    const dexConfig = getDexes(effectiveChainId, 'v3')[0]
    const positionManager = dexConfig?.positionManager
    const tokenMap = useTokenMap(effectiveChainId)

    const {
        described,
        isLoading: isLoadingIndexed,
        refetch: refetchIndexed,
    } = useDescribedPositions({
        chainId: effectiveChainId,
        tokenIds: tokenId === undefined ? undefined : [tokenId],
        enabled: tokenId !== undefined,
        staleTime: 10_000,
    })

    // A freshly minted position can be missing from the indexer; read it straight from the
    // position manager and describe that instead.
    const needsFallback =
        tokenId !== undefined && !!positionManager && !isLoadingIndexed && described.length === 0

    const {
        data: positionData,
        isLoading: isLoadingFallback,
        refetch: refetchFallback,
    } = useReadContract({
        address: positionManager,
        abi: getAbi('positionManager'),
        functionName: 'positions',
        args: needsFallback ? [tokenId!] : undefined,
        chainId: effectiveChainId,
        query: { enabled: needsFallback, staleTime: 10_000 },
    })

    const fallbackInput = useMemo<PositionInput[] | undefined>(() => {
        if (tokenId === undefined || !positionData) return undefined
        const [, , token0, token1, fee, tickLower, tickUpper, liquidity, , , owed0, owed1] =
            positionData
        return [
            {
                tokenId,
                owner: ZERO_ADDRESS,
                token0,
                token1,
                fee,
                tickLower,
                tickUpper,
                liquidity,
                tokensOwed0: owed0,
                tokensOwed1: owed1,
            },
        ]
    }, [positionData, tokenId])

    const { described: describedFallback, isLoading: isDescribingFallback } = useDescribedPositions(
        {
            chainId: effectiveChainId,
            positions: fallbackInput,
            enabled: needsFallback && !!fallbackInput,
            staleTime: 10_000,
        }
    )

    const position = useMemo<PositionDetails | null>(() => {
        const source = described[0] ?? describedFallback[0]
        if (!source) return null
        return toPositionDetails(source, tokenMap, effectiveChainId)
    }, [described, describedFallback, tokenMap, effectiveChainId])

    const refetch = () => {
        refetchIndexed()
        refetchFallback()
    }

    return {
        position,
        isLoading: isLoadingIndexed || isLoadingFallback || isDescribingFallback,
        refetch,
    }
}
