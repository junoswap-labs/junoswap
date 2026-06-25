'use client'

import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { TOKEN_LISTS } from '@/lib/tokens'
import type { Token } from '@/types/tokens'
import type { V3PoolData } from '@/types/earn'
import { getV3Config } from '@/lib/dex-config'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { getTickSpacing } from '@/lib/liquidity-helpers'
import { sortTokens } from '@/lib/liquidity-helpers'

export function usePool(
    token0: Token | null,
    token1: Token | null,
    fee: number,
    chainId?: number
): {
    pool: V3PoolData | null
    isLoading: boolean
    isError: boolean
    error: Error | null
} {
    const effectiveChainId = chainId ?? token0?.chainId ?? token1?.chainId ?? 1
    const dexConfig = getV3Config(effectiveChainId)
    const [sortedToken0, sortedToken1] = useMemo(() => {
        if (!token0 || !token1) return [null, null]
        return sortTokens(token0, token1)
    }, [token0, token1])
    const isEnabled = !!sortedToken0 && !!sortedToken1 && !!dexConfig
    const {
        data: poolAddress,
        isLoading: isLoadingPool,
        isError: isPoolError,
        error: poolError,
    } = useReadContract({
        address: dexConfig?.factory,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: 'getPool',
        args: isEnabled ? [sortedToken0!.address, sortedToken1!.address, fee] : undefined,
        chainId: effectiveChainId,
        query: {
            enabled: isEnabled,
            staleTime: 60_000, // 1 minute
        },
    })
    const isValidPool = poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000'
    const {
        data: poolState,
        isLoading: isLoadingState,
        isError: isStateError,
        error: stateError,
    } = useReadContracts({
        contracts: [
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
        ],
        query: {
            enabled: isValidPool,
            staleTime: 10_000, // 10 seconds
        },
    })
    const pool = useMemo<V3PoolData | null>(() => {
        if (!isValidPool || !poolState || !sortedToken0 || !sortedToken1) return null
        const slot0 = poolState[0]?.result as
            | [bigint, number, number, number, number, number, boolean]
            | undefined
        const liquidity = poolState[1]?.result as bigint | undefined
        if (!slot0 || liquidity === undefined) return null
        const [sqrtPriceX96, tick] = slot0
        return {
            address: poolAddress as Address,
            token0: sortedToken0,
            token1: sortedToken1,
            fee,
            liquidity,
            sqrtPriceX96,
            tick,
            tickSpacing: getTickSpacing(fee),
        }
    }, [isValidPool, poolAddress, poolState, sortedToken0, sortedToken1, fee])
    return {
        pool,
        isLoading: isLoadingPool || isLoadingState,
        isError: isPoolError || isStateError,
        error: poolError || stateError || null,
    }
}

export function usePoolsForPair(
    token0: Token | null,
    token1: Token | null,
    chainId?: number
): {
    pools: V3PoolData[]
    isLoading: boolean
} {
    const effectiveChainId = chainId ?? token0?.chainId ?? token1?.chainId ?? 1
    const dexConfig = getV3Config(effectiveChainId)
    const feeTiers = useMemo(() => dexConfig?.feeTiers ?? [100, 500, 3000, 10000], [dexConfig])
    const [sortedToken0, sortedToken1] = useMemo(() => {
        if (!token0 || !token1) return [null, null]
        return sortTokens(token0, token1)
    }, [token0, token1])
    const isEnabled = !!sortedToken0 && !!sortedToken1 && !!dexConfig
    const { data: poolAddresses, isLoading: isLoadingAddresses } = useReadContracts({
        contracts: feeTiers.map((fee) => ({
            address: dexConfig?.factory as Address,
            abi: UNISWAP_V3_FACTORY_ABI,
            functionName: 'getPool',
            args: [sortedToken0?.address, sortedToken1?.address, fee],
            chainId: effectiveChainId,
        })),
        query: {
            enabled: isEnabled,
            staleTime: 60_000,
        },
    })
    const validPools = useMemo(() => {
        if (!poolAddresses) return []
        return poolAddresses
            .map((result, index) => ({
                address: result.result as Address | undefined,
                fee: feeTiers[index],
            }))
            .filter((p) => p.address && p.address !== '0x0000000000000000000000000000000000000000')
    }, [poolAddresses, feeTiers])
    const { data: poolStates, isLoading: isLoadingStates } = useReadContracts({
        contracts: validPools.flatMap((pool) => [
            {
                address: pool.address as Address,
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'slot0',
                chainId: effectiveChainId,
            },
            {
                address: pool.address as Address,
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'liquidity',
                chainId: effectiveChainId,
            },
        ]),
        query: {
            enabled: validPools.length > 0,
            staleTime: 10_000,
        },
    })
    const pools = useMemo<V3PoolData[]>(() => {
        if (!poolStates || !sortedToken0 || !sortedToken1) return []
        return validPools
            .map((pool, index) => {
                const slot0 = poolStates[index * 2]?.result as
                    | [bigint, number, number, number, number, number, boolean]
                    | undefined
                const liquidity = poolStates[index * 2 + 1]?.result as bigint | undefined
                if (!slot0 || liquidity === undefined) return null
                const [sqrtPriceX96, tick] = slot0
                return {
                    address: pool.address as Address,
                    token0: sortedToken0,
                    token1: sortedToken1,
                    fee: pool.fee!,
                    liquidity,
                    sqrtPriceX96,
                    tick,
                    tickSpacing: getTickSpacing(pool.fee!),
                }
            })
            .filter((p): p is V3PoolData => p !== null && p.liquidity > 0n)
    }, [poolStates, validPools, sortedToken0, sortedToken1])
    return {
        pools,
        isLoading: isLoadingAddresses || isLoadingStates,
    }
}

/**
 * Discover pools by checking all pairs of the first 6 tokens in the token list.
 * Used for chains without Ponder indexing.
 */
export function useCommonPools(chainId: number): { pools: V3PoolData[]; isLoading: boolean } {
    const tokens = TOKEN_LISTS[chainId] ?? []
    // Get first 6 tokens to check pools (always use fixed number for stable hook count)
    const t0 = tokens[0] as Token | null
    const t1 = tokens[1] as Token | null
    const t2 = tokens[2] as Token | null
    const t3 = tokens[3] as Token | null
    const t4 = tokens[4] as Token | null
    const t5 = tokens[5] as Token | null

    // Call constant number of hooks (15 pairs for 6 tokens)
    const p01 = usePoolsForPair(t0, t1, chainId)
    const p02 = usePoolsForPair(t0, t2, chainId)
    const p03 = usePoolsForPair(t0, t3, chainId)
    const p04 = usePoolsForPair(t0, t4, chainId)
    const p05 = usePoolsForPair(t0, t5, chainId)
    const p12 = usePoolsForPair(t1, t2, chainId)
    const p13 = usePoolsForPair(t1, t3, chainId)
    const p14 = usePoolsForPair(t1, t4, chainId)
    const p15 = usePoolsForPair(t1, t5, chainId)
    const p23 = usePoolsForPair(t2, t3, chainId)
    const p24 = usePoolsForPair(t2, t4, chainId)
    const p25 = usePoolsForPair(t2, t5, chainId)
    const p34 = usePoolsForPair(t3, t4, chainId)
    const p35 = usePoolsForPair(t3, t5, chainId)
    const p45 = usePoolsForPair(t4, t5, chainId)

    const poolResults = useMemo(
        () => [p01, p02, p03, p04, p05, p12, p13, p14, p15, p23, p24, p25, p34, p35, p45],
        [p01, p02, p03, p04, p05, p12, p13, p14, p15, p23, p24, p25, p34, p35, p45]
    )

    const allPools = useMemo(() => {
        const combined = poolResults.flatMap((r) => r.pools)
        const unique = new Map<string, V3PoolData>()
        combined.forEach((pool) => {
            unique.set(pool.address, pool)
        })
        return Array.from(unique.values())
    }, [poolResults])
    const isLoading = poolResults.some((r) => r.isLoading)
    return {
        pools: allPools,
        isLoading,
    }
}
