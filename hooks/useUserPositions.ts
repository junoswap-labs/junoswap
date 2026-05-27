'use client'

import { useMemo } from 'react'
import { useReadContract, useReadContracts, useChainId } from 'wagmi'
import type { Address } from 'viem'
import type { V3Position, PositionWithTokens, PositionDetails } from '@/types/earn'
import type { Token } from '@/types/tokens'
import { getV3Config } from '@/lib/dex-config'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '@/lib/abis/nonfungible-position-manager'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { TOKEN_LISTS } from '@/lib/tokens'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import {
    isInRange,
    tickToSqrtPriceX96,
    getAmountsForLiquidity,
    sqrtPriceX96ToPrice,
    tickToPrice,
} from '@/lib/liquidity-helpers'

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
    const dexConfig = getV3Config(effectiveChainId)
    const positionManager = dexConfig?.positionManager
    const isEnabled = !!owner && !!positionManager
    const { tokens: graduatedTokens } = useGraduatedTokens(effectiveChainId)
    const tokenMap = useMemo(
        () => buildTokenMap(effectiveChainId, graduatedTokens),
        [effectiveChainId, graduatedTokens]
    )
    const {
        data: balance,
        isLoading: isLoadingBalance,
        refetch: refetchBalance,
    } = useReadContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'balanceOf',
        args: isEnabled ? [owner] : undefined,
        chainId: effectiveChainId,
        query: {
            enabled: isEnabled,
            staleTime: 30_000,
        },
    })
    const positionCount = Number(balance ?? 0n)
    const {
        data: tokenIds,
        isLoading: isLoadingTokenIds,
        refetch: refetchTokenIds,
    } = useReadContracts({
        contracts: Array.from({ length: positionCount }, (_, i) => ({
            address: positionManager as Address,
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            functionName: 'tokenOfOwnerByIndex',
            args: [owner as Address, BigInt(i)],
            chainId: effectiveChainId,
        })),
        query: {
            enabled: isEnabled && positionCount > 0,
            staleTime: 30_000,
        },
    })
    const validTokenIds = useMemo(() => {
        if (!tokenIds) return []
        return tokenIds
            .map((r) => r.result as bigint | undefined)
            .filter((id): id is bigint => id !== undefined)
    }, [tokenIds])
    const {
        data: positionData,
        isLoading: isLoadingPositions,
        refetch: refetchPositionsData,
    } = useReadContracts({
        contracts: validTokenIds.map((tokenId) => ({
            address: positionManager as Address,
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            functionName: 'positions',
            args: [tokenId],
            chainId: effectiveChainId,
        })),
        query: {
            enabled: validTokenIds.length > 0,
            staleTime: 10_000,
        },
    })
    const rawPositions = useMemo<V3Position[]>(() => {
        if (!positionData) return []
        return positionData
            .map((result, index) => {
                const data = result.result as
                    | [
                          bigint,
                          Address,
                          Address,
                          Address,
                          number,
                          number,
                          number,
                          bigint,
                          bigint,
                          bigint,
                          bigint,
                          bigint,
                      ]
                    | undefined
                if (!data) return null
                const [
                    nonce,
                    operator,
                    token0,
                    token1,
                    fee,
                    tickLower,
                    tickUpper,
                    liquidity,
                    feeGrowthInside0LastX128,
                    feeGrowthInside1LastX128,
                    tokensOwed0,
                    tokensOwed1,
                ] = data
                return {
                    tokenId: validTokenIds[index]!,
                    nonce,
                    operator,
                    token0,
                    token1,
                    fee,
                    tickLower,
                    tickUpper,
                    liquidity,
                    feeGrowthInside0LastX128,
                    feeGrowthInside1LastX128,
                    tokensOwed0,
                    tokensOwed1,
                }
            })
            .filter((p): p is V3Position => p !== null)
    }, [positionData, validTokenIds])
    const uniquePoolKeys = useMemo(() => {
        const keys = new Set<string>()
        rawPositions.forEach((p) => {
            keys.add(`${p.token0}-${p.token1}-${p.fee}`)
        })
        return Array.from(keys).map((key) => {
            const [token0, token1, fee] = key.split('-')
            return { token0: token0 as Address, token1: token1 as Address, fee: parseInt(fee!) }
        })
    }, [rawPositions])
    const {
        data: poolAddresses,
        isLoading: isLoadingPoolAddresses,
        refetch: refetchPoolAddresses,
    } = useReadContracts({
        contracts: uniquePoolKeys.map(({ token0, token1, fee }) => ({
            address: dexConfig?.factory as Address,
            abi: UNISWAP_V3_FACTORY_ABI,
            functionName: 'getPool',
            args: [token0, token1, fee],
            chainId: effectiveChainId,
        })),
        query: {
            enabled: uniquePoolKeys.length > 0 && !!dexConfig,
            staleTime: 60_000,
        },
    })
    const poolAddressList = useMemo(() => {
        if (!poolAddresses) return []
        return poolAddresses
            .map((r) => r.result as Address | undefined)
            .filter((a): a is Address => !!a && a !== '0x0000000000000000000000000000000000000000')
    }, [poolAddresses])
    const {
        data: poolStates,
        isLoading: isLoadingPoolStates,
        refetch: refetchPoolStates,
    } = useReadContracts({
        contracts: poolAddressList.map((poolAddress) => ({
            address: poolAddress,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'slot0',
            chainId: effectiveChainId,
        })),
        query: {
            enabled: poolAddressList.length > 0,
            staleTime: 10_000,
        },
    })
    const poolStateMap = useMemo(() => {
        const map = new Map<string, { sqrtPriceX96: bigint; tick: number }>()
        if (!poolStates || !poolAddresses) return map
        uniquePoolKeys.forEach((key, index) => {
            const poolAddress = poolAddresses[index]?.result as Address | undefined
            if (!poolAddress) return
            const poolIndex = poolAddressList.indexOf(poolAddress)
            if (poolIndex === -1) return
            const slot0 = poolStates[poolIndex]?.result as
                | [bigint, number, number, number, number, number, boolean]
                | undefined
            if (!slot0) return
            const mapKey = `${key.token0}-${key.token1}-${key.fee}`
            map.set(mapKey, { sqrtPriceX96: slot0[0], tick: slot0[1] })
        })
        return map
    }, [poolStates, poolAddresses, poolAddressList, uniquePoolKeys])
    const positions = useMemo<PositionWithTokens[]>(() => {
        return rawPositions.map((position) => {
            const token0Info =
                tokenMap.get(position.token0.toLowerCase()) ??
                createPlaceholderToken(position.token0, effectiveChainId)
            const token1Info =
                tokenMap.get(position.token1.toLowerCase()) ??
                createPlaceholderToken(position.token1, effectiveChainId)
            const poolKey = `${position.token0}-${position.token1}-${position.fee}`
            const poolState = poolStateMap.get(poolKey)
            let amount0 = 0n
            let amount1 = 0n
            let currentTick = position.tickLower // fallback
            if (poolState) {
                const sqrtPriceAX96 = tickToSqrtPriceX96(position.tickLower)
                const sqrtPriceBX96 = tickToSqrtPriceX96(position.tickUpper)
                const amounts = getAmountsForLiquidity(
                    poolState.sqrtPriceX96,
                    sqrtPriceAX96,
                    sqrtPriceBX96,
                    position.liquidity
                )
                amount0 = amounts.amount0
                amount1 = amounts.amount1
                currentTick = poolState.tick
            }
            const poolAddress = poolAddresses?.[
                uniquePoolKeys.findIndex((k) => `${k.token0}-${k.token1}-${k.fee}` === poolKey)
            ]?.result as Address | undefined
            return {
                ...position,
                token0Info,
                token1Info,
                poolAddress:
                    poolAddress ?? ('0x0000000000000000000000000000000000000000' as Address),
                inRange: isInRange(currentTick, position.tickLower, position.tickUpper),
                amount0,
                amount1,
                uncollectedFees0: position.tokensOwed0,
                uncollectedFees1: position.tokensOwed1,
            }
        })
    }, [rawPositions, effectiveChainId, tokenMap, poolStateMap, poolAddresses, uniquePoolKeys])
    const refetch = () => {
        refetchBalance()
        refetchTokenIds()
        refetchPositionsData()
        refetchPoolAddresses()
        refetchPoolStates()
    }
    return {
        positions,
        isLoading:
            isLoadingBalance ||
            isLoadingTokenIds ||
            isLoadingPositions ||
            isLoadingPoolAddresses ||
            isLoadingPoolStates,
        isError: false,
        refetch,
    }
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
    const dexConfig = getV3Config(effectiveChainId)
    const positionManager = dexConfig?.positionManager
    const isEnabled = tokenId !== undefined && !!positionManager
    const { tokens: graduatedTokens } = useGraduatedTokens(effectiveChainId)
    const tokenMap = useMemo(
        () => buildTokenMap(effectiveChainId, graduatedTokens),
        [effectiveChainId, graduatedTokens]
    )
    const {
        data: positionData,
        isLoading: isLoadingPosition,
        refetch,
    } = useReadContract({
        address: positionManager,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'positions',
        args: isEnabled ? [tokenId] : undefined,
        chainId: effectiveChainId,
        query: {
            enabled: isEnabled,
            staleTime: 10_000,
        },
    })
    const rawPosition = useMemo<V3Position | null>(() => {
        if (!positionData || tokenId === undefined) return null
        const [
            nonce,
            operator,
            token0,
            token1,
            fee,
            tickLower,
            tickUpper,
            liquidity,
            feeGrowthInside0LastX128,
            feeGrowthInside1LastX128,
            tokensOwed0,
            tokensOwed1,
        ] = positionData
        return {
            tokenId,
            nonce,
            operator,
            token0,
            token1,
            fee,
            tickLower,
            tickUpper,
            liquidity,
            feeGrowthInside0LastX128,
            feeGrowthInside1LastX128,
            tokensOwed0,
            tokensOwed1,
        }
    }, [positionData, tokenId])
    const { data: poolAddress, isLoading: isLoadingPoolAddress } = useReadContract({
        address: dexConfig?.factory,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: 'getPool',
        args: rawPosition ? [rawPosition.token0, rawPosition.token1, rawPosition.fee] : undefined,
        chainId: effectiveChainId,
        query: {
            enabled: !!rawPosition,
            staleTime: 60_000,
        },
    })
    const { data: poolState, isLoading: isLoadingPoolState } = useReadContracts({
        contracts: poolAddress
            ? [
                  {
                      address: poolAddress as Address,
                      abi: UNISWAP_V3_POOL_ABI,
                      functionName: 'slot0',
                      chainId: effectiveChainId,
                  },
                  {
                      address: poolAddress as Address,
                      abi: UNISWAP_V3_POOL_ABI,
                      functionName: 'liquidity',
                      chainId: effectiveChainId,
                  },
              ]
            : [],
        query: {
            enabled: !!poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000',
            staleTime: 10_000,
        },
    })
    const position = useMemo<PositionDetails | null>(() => {
        if (!rawPosition) return null
        const token0Info =
            tokenMap.get(rawPosition.token0.toLowerCase()) ??
            createPlaceholderToken(rawPosition.token0, effectiveChainId)
        const token1Info =
            tokenMap.get(rawPosition.token1.toLowerCase()) ??
            createPlaceholderToken(rawPosition.token1, effectiveChainId)
        const slot0 = poolState?.[0]?.result as
            | [bigint, number, number, number, number, number, boolean]
            | undefined
        const poolLiquidity = poolState?.[1]?.result as bigint | undefined
        const sqrtPriceX96 = slot0?.[0] ?? 0n
        const currentTick = slot0?.[1] ?? rawPosition.tickLower
        const sqrtPriceAX96 = tickToSqrtPriceX96(rawPosition.tickLower)
        const sqrtPriceBX96 = tickToSqrtPriceX96(rawPosition.tickUpper)
        const { amount0, amount1 } = getAmountsForLiquidity(
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            rawPosition.liquidity
        )
        const priceLower = tickToPrice(
            rawPosition.tickLower,
            token0Info.decimals,
            token1Info.decimals
        )
        const priceUpper = tickToPrice(
            rawPosition.tickUpper,
            token0Info.decimals,
            token1Info.decimals
        )
        const currentPrice =
            sqrtPriceX96 > 0n
                ? sqrtPriceX96ToPrice(sqrtPriceX96, token0Info.decimals, token1Info.decimals)
                : '0'
        return {
            ...rawPosition,
            token0Info,
            token1Info,
            poolAddress:
                (poolAddress as Address) ??
                ('0x0000000000000000000000000000000000000000' as Address),
            inRange: isInRange(currentTick, rawPosition.tickLower, rawPosition.tickUpper),
            amount0,
            amount1,
            uncollectedFees0: rawPosition.tokensOwed0,
            uncollectedFees1: rawPosition.tokensOwed1,
            currentTick,
            sqrtPriceX96,
            poolLiquidity: poolLiquidity ?? 0n,
            priceLower,
            priceUpper,
            currentPrice,
        }
    }, [rawPosition, effectiveChainId, tokenMap, poolState, poolAddress])
    return {
        position,
        isLoading: isLoadingPosition || isLoadingPoolAddress || isLoadingPoolState,
        refetch,
    }
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
    const dexConfig = getV3Config(effectiveChainId)
    const positionManager = dexConfig?.positionManager
    const { tokens: graduatedTokens } = useGraduatedTokens(effectiveChainId)
    const tokenMap = useMemo(
        () => buildTokenMap(effectiveChainId, graduatedTokens),
        [effectiveChainId, graduatedTokens]
    )
    const {
        data: positionData,
        isLoading: isLoadingPositions,
        refetch: refetchPositions,
    } = useReadContracts({
        contracts: tokenIds.map((tokenId) => ({
            address: positionManager as Address,
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            functionName: 'positions' as const,
            args: [tokenId] as const,
            chainId: effectiveChainId,
        })),
        query: {
            enabled: tokenIds.length > 0 && !!positionManager,
            staleTime: 10_000,
        },
    })
    const rawPositions = useMemo<V3Position[]>(() => {
        if (!positionData) return []
        return positionData
            .map((result, index) => {
                const data = result.result as
                    | [
                          bigint,
                          Address,
                          Address,
                          Address,
                          number,
                          number,
                          number,
                          bigint,
                          bigint,
                          bigint,
                          bigint,
                          bigint,
                      ]
                    | undefined
                if (!data) return null
                const [
                    nonce,
                    operator,
                    token0,
                    token1,
                    fee,
                    tickLower,
                    tickUpper,
                    liquidity,
                    feeGrowthInside0LastX128,
                    feeGrowthInside1LastX128,
                    tokensOwed0,
                    tokensOwed1,
                ] = data
                return {
                    tokenId: tokenIds[index]!,
                    nonce,
                    operator,
                    token0,
                    token1,
                    fee,
                    tickLower,
                    tickUpper,
                    liquidity,
                    feeGrowthInside0LastX128,
                    feeGrowthInside1LastX128,
                    tokensOwed0,
                    tokensOwed1,
                }
            })
            .filter((p): p is V3Position => p !== null)
    }, [positionData, tokenIds])
    const uniquePoolKeys = useMemo(() => {
        const keys = new Set<string>()
        rawPositions.forEach((p) => {
            keys.add(`${p.token0}-${p.token1}-${p.fee}`)
        })
        return Array.from(keys).map((key) => {
            const [token0, token1, fee] = key.split('-')
            return { token0: token0 as Address, token1: token1 as Address, fee: parseInt(fee!) }
        })
    }, [rawPositions])
    const {
        data: poolAddresses,
        isLoading: isLoadingPoolAddresses,
        refetch: refetchPoolAddresses,
    } = useReadContracts({
        contracts: uniquePoolKeys.map(({ token0, token1, fee }) => ({
            address: dexConfig?.factory as Address,
            abi: UNISWAP_V3_FACTORY_ABI,
            functionName: 'getPool' as const,
            args: [token0, token1, fee] as const,
            chainId: effectiveChainId,
        })),
        query: {
            enabled: uniquePoolKeys.length > 0 && !!dexConfig,
            staleTime: 60_000,
        },
    })
    const poolAddressList = useMemo(() => {
        if (!poolAddresses) return []
        return poolAddresses
            .map((r) => r.result as Address | undefined)
            .filter((a): a is Address => !!a && a !== '0x0000000000000000000000000000000000000000')
    }, [poolAddresses])
    const {
        data: poolStates,
        isLoading: isLoadingPoolStates,
        refetch: refetchPoolStates,
    } = useReadContracts({
        contracts: poolAddressList.map((poolAddress) => ({
            address: poolAddress,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'slot0' as const,
            chainId: effectiveChainId,
        })),
        query: {
            enabled: poolAddressList.length > 0,
            staleTime: 10_000,
        },
    })
    const poolStateMap = useMemo(() => {
        const map = new Map<string, { sqrtPriceX96: bigint; tick: number }>()
        if (!poolStates || !poolAddresses) return map
        uniquePoolKeys.forEach((key, index) => {
            const poolAddress = poolAddresses[index]?.result as Address | undefined
            if (!poolAddress) return
            const poolIndex = poolAddressList.indexOf(poolAddress)
            if (poolIndex === -1) return
            const slot0 = poolStates[poolIndex]?.result as
                | [bigint, number, number, number, number, number, boolean]
                | undefined
            if (!slot0) return
            const mapKey = `${key.token0}-${key.token1}-${key.fee}`
            map.set(mapKey, { sqrtPriceX96: slot0[0], tick: slot0[1] })
        })
        return map
    }, [poolStates, poolAddresses, poolAddressList, uniquePoolKeys])
    const positions = useMemo<PositionWithTokens[]>(() => {
        return rawPositions.map((position) => {
            const token0Info =
                tokenMap.get(position.token0.toLowerCase()) ??
                createPlaceholderToken(position.token0, effectiveChainId)
            const token1Info =
                tokenMap.get(position.token1.toLowerCase()) ??
                createPlaceholderToken(position.token1, effectiveChainId)
            const poolKey = `${position.token0}-${position.token1}-${position.fee}`
            const poolState = poolStateMap.get(poolKey)
            let amount0 = 0n
            let amount1 = 0n
            let currentTick = position.tickLower // fallback
            if (poolState) {
                const sqrtPriceAX96 = tickToSqrtPriceX96(position.tickLower)
                const sqrtPriceBX96 = tickToSqrtPriceX96(position.tickUpper)
                const amounts = getAmountsForLiquidity(
                    poolState.sqrtPriceX96,
                    sqrtPriceAX96,
                    sqrtPriceBX96,
                    position.liquidity
                )
                amount0 = amounts.amount0
                amount1 = amounts.amount1
                currentTick = poolState.tick
            }
            const poolAddress = poolAddresses?.[
                uniquePoolKeys.findIndex((k) => `${k.token0}-${k.token1}-${k.fee}` === poolKey)
            ]?.result as Address | undefined
            return {
                ...position,
                token0Info,
                token1Info,
                poolAddress:
                    poolAddress ?? ('0x0000000000000000000000000000000000000000' as Address),
                inRange: isInRange(currentTick, position.tickLower, position.tickUpper),
                amount0,
                amount1,
                uncollectedFees0: position.tokensOwed0,
                uncollectedFees1: position.tokensOwed1,
            }
        })
    }, [rawPositions, effectiveChainId, tokenMap, poolStateMap, poolAddresses, uniquePoolKeys])
    const refetch = () => {
        refetchPositions()
        refetchPoolAddresses()
        refetchPoolStates()
    }
    return {
        positions,
        isLoading: isLoadingPositions || isLoadingPoolAddresses || isLoadingPoolStates,
        refetch,
    }
}
