'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReadContract, useChainId, usePublicClient } from 'wagmi'
import { zeroAddress, type Address, type PublicClient } from 'viem'
import type { V3Position, PositionWithTokens, PositionDetails } from '@/types/earn'
import {
    getAbi,
    getDexes,
    fetchUserPositions as fetchIndexedPositions,
    fetchPositionsByTokenIds as fetchIndexedPositionsByIds,
} from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import { TOKEN_LISTS } from '@/lib/tokens'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import { formatPoolPrice } from '@/lib/liquidity-helpers'
import {
    getAmountsForLiquidity,
    tickToSqrtPriceX96,
    computeTickPrice,
    isInRange,
} from '@/lib/tick-math'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

/** What describePositions is handed for a position the indexer hasn't caught up to yet. */
interface PositionInput {
    tokenId: bigint
    owner: string
    token0: string
    token1: string
    fee: number
    tickLower: number
    tickUpper: number
    liquidity: bigint
    tokensOwed0: bigint
    tokensOwed1: bigint
}

/** The slice of what describePositions returns that the position UIs actually read. */
interface DescribedPosition extends PositionInput {
    poolAddress: Address
    amount0: bigint
    amount1: bigint
    uncollectedFees0: bigint
    uncollectedFees1: bigint
    currentTick: number
    sqrtPriceX96: bigint
    poolLiquidity: bigint
    inRange: boolean
    priceLower: number
    priceUpper: number
    currentPrice: number
}

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

function positionPoolKey(token0: string, token1: string, fee: number): string {
    return `${token0.toLowerCase()}-${token1.toLowerCase()}-${fee}`
}

function toPositionInput(row: {
    tokenId: string | bigint
    owner: string
    token0: string
    token1: string
    fee: number
    tickLower: number
    tickUpper: number
    liquidity: string | bigint
    tokensOwed0: string | bigint
    tokensOwed1: string | bigint
}): PositionInput {
    return {
        tokenId: BigInt(row.tokenId),
        owner: row.owner,
        token0: row.token0,
        token1: row.token1,
        fee: row.fee,
        tickLower: row.tickLower,
        tickUpper: row.tickUpper,
        liquidity: BigInt(row.liquidity),
        tokensOwed0: BigInt(row.tokensOwed0),
        tokensOwed1: BigInt(row.tokensOwed1),
    }
}

const MAX_UINT128 = 2n ** 128n - 1n

/** Live uncollected fees via a `collect()` simulation -- the indexer's tokensOwed only reflects
 *  fees already checkpointed on-chain, not fees accrued since the last mint/burn/collect. */
async function collectFees(
    publicClient: PublicClient,
    positionManager: Address,
    positions: PositionInput[]
): Promise<Map<string, { fees0: bigint; fees1: bigint }>> {
    const settled = await Promise.allSettled(
        positions.map((position) =>
            publicClient.simulateContract({
                address: positionManager,
                abi: getAbi('positionManager'),
                functionName: 'collect',
                account: position.owner as Address,
                args: [
                    {
                        tokenId: position.tokenId,
                        recipient: position.owner as Address,
                        amount0Max: MAX_UINT128,
                        amount1Max: MAX_UINT128,
                    },
                ],
            })
        )
    )
    const map = new Map<string, { fees0: bigint; fees1: bigint }>()
    settled.forEach((outcome, i) => {
        const position = positions[i]
        if (!position || outcome.status !== 'fulfilled') return
        const result = outcome.value.result as readonly [bigint, bigint] | undefined
        if (!result) return
        map.set(position.tokenId.toString(), { fees0: result[0], fees1: result[1] })
    })
    return map
}

/** Ported from the SDK's fetchPositions (removed upstream in 0.56.0, which now only publishes
 *  chain-facing primitives): resolves each position's pool via the factory, reads pool state and
 *  simulates fee collection, then folds it all into the shape the position UIs read. */
async function describePositions(
    publicClient: PublicClient,
    factory: Address,
    positionManager: Address | undefined,
    positions: PositionInput[],
    decimals: Map<string, number>
): Promise<DescribedPosition[]> {
    if (positions.length === 0) return []

    const keys = new Map<string, { token0: Address; token1: Address; fee: number }>()
    for (const p of positions) {
        const key = positionPoolKey(p.token0, p.token1, p.fee)
        if (!keys.has(key)) {
            keys.set(key, { token0: p.token0 as Address, token1: p.token1 as Address, fee: p.fee })
        }
    }
    const keyEntries = [...keys.entries()]

    const poolAddressResults = await publicClient.multicall({
        contracts: keyEntries.map(([, k]) => ({
            address: factory,
            abi: getAbi('v3Factory'),
            functionName: 'getPool' as const,
            args: [k.token0, k.token1, k.fee] as const,
        })),
        allowFailure: true,
    })
    const poolAddresses = new Map<string, Address>()
    keyEntries.forEach(([key], i) => {
        const result = poolAddressResults[i]
        if (result?.status !== 'success') return
        const address = result.result as Address
        if (address && address !== zeroAddress) poolAddresses.set(key, address)
    })

    const pools = [...new Set(poolAddresses.values())]
    const stateResults = pools.length
        ? await publicClient.multicall({
              contracts: pools.flatMap((pool) => [
                  {
                      address: pool,
                      abi: getAbi('v3Pool'),
                      functionName: 'slot0' as const,
                      args: [],
                  },
                  {
                      address: pool,
                      abi: getAbi('v3Pool'),
                      functionName: 'liquidity' as const,
                      args: [],
                  },
              ]),
              allowFailure: true,
          })
        : []
    const poolStates = new Map<string, { sqrtPriceX96: bigint; tick: number; liquidity: bigint }>()
    pools.forEach((pool, i) => {
        const slot0 = stateResults[i * 2]
        const liquidityResult = stateResults[i * 2 + 1]
        if (slot0?.status !== 'success') return
        const decoded = slot0.result as readonly [bigint, number, ...unknown[]]
        poolStates.set(pool.toLowerCase(), {
            sqrtPriceX96: decoded[0],
            tick: decoded[1],
            liquidity:
                liquidityResult?.status === 'success' ? (liquidityResult.result as bigint) : 0n,
        })
    })

    const fees = positionManager
        ? await collectFees(publicClient, positionManager, positions)
        : new Map<string, { fees0: bigint; fees1: bigint }>()

    return positions.map((position) => {
        const key = positionPoolKey(position.token0, position.token1, position.fee)
        const poolAddress = poolAddresses.get(key)
        const state = poolAddress ? poolStates.get(poolAddress.toLowerCase()) : undefined
        const decimals0 = decimals.get(position.token0.toLowerCase()) ?? 18
        const decimals1 = decimals.get(position.token1.toLowerCase()) ?? 18
        const amounts = state
            ? getAmountsForLiquidity(
                  state.sqrtPriceX96,
                  tickToSqrtPriceX96(position.tickLower),
                  tickToSqrtPriceX96(position.tickUpper),
                  position.liquidity
              )
            : { amount0: 0n, amount1: 0n }
        const currentTick = state?.tick ?? position.tickLower
        const fee = fees.get(position.tokenId.toString())
        return {
            ...position,
            poolAddress: poolAddress ?? ZERO_ADDRESS,
            amount0: amounts.amount0,
            amount1: amounts.amount1,
            uncollectedFees0: fee?.fees0 ?? position.tokensOwed0,
            uncollectedFees1: fee?.fees1 ?? position.tokensOwed1,
            currentTick,
            sqrtPriceX96: state?.sqrtPriceX96 ?? 0n,
            poolLiquidity: state?.liquidity ?? 0n,
            inRange: state ? isInRange(currentTick, position.tickLower, position.tickUpper) : false,
            priceLower: computeTickPrice({ tick: position.tickLower, decimals0, decimals1 }),
            priceUpper: computeTickPrice({ tick: position.tickUpper, decimals0, decimals1 }),
            currentPrice: state ? computeTickPrice({ tick: currentTick, decimals0, decimals1 }) : 0,
        }
    })
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
                const config = getDexes(chainId, 'v3')[0]
                if (!config) return []

                let inputPositions: PositionInput[]
                if (positions) {
                    inputPositions = positions
                } else if (owner) {
                    const rows = await fetchIndexedPositions(ponderClient, { chainId, owner })
                    inputPositions = rows.map(toPositionInput)
                } else {
                    const rows = await fetchIndexedPositionsByIds(ponderClient, {
                        chainId,
                        tokenIds: tokenIds ?? [],
                    })
                    inputPositions = rows.map(toPositionInput)
                }

                return await describePositions(
                    publicClient,
                    config.factory,
                    config.positionManager,
                    inputPositions,
                    decimals
                )
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
