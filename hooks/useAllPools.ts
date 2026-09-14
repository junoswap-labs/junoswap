'use client'

import { useMemo } from 'react'
import type { Address } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { fetchPoolMetrics } from '@coshi190/juno-moneta-sdk'
import type { PoolMetrics } from '@/types/pools'
import type { Token } from '@/types/token'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { getTokensForChain } from '@/lib/tokens'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import { useV3Tokens } from '@/hooks/useV3Tokens'
import type { V3PoolData } from '@/types/earn'
const PONDER_INDEXED_CHAINS = new Set([25925, 96, 8899])

export function useAllPools(chainId: number): {
    pools: V3PoolData[]
    metricsByAddress: Map<string, PoolMetrics>
    isLoading: boolean
} {
    const isIndexed = PONDER_INDEXED_CHAINS.has(chainId)

    const staticTokens = useMemo(() => getTokensForChain(chainId), [chainId])
    const { tokens: graduatedTokens } = useGraduatedTokens(chainId)
    const { tokens: v3Tokens } = useV3Tokens(chainId)

    const { data: metrics, isLoading } = useQuery({
        queryKey: ['v3-pool-metrics', chainId],
        queryFn: async () => {
            try {
                return await fetchPoolMetrics(ponderClient, { chainId })
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: isIndexed,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const tokenLookup = useMemo(() => {
        const map = new Map<string, Token>()
        const add = (t: Token) => {
            const key = t.address.toLowerCase()
            if (!map.has(key)) map.set(key, t)
        }
        for (const t of staticTokens) add(t)
        for (const t of graduatedTokens) add(t)
        for (const t of v3Tokens) {
            add({
                address: t.address as Address,
                symbol: t.symbol || '???',
                name: t.name || '',
                decimals: t.decimals || 18,
                chainId,
            })
        }
        return map
    }, [staticTokens, graduatedTokens, v3Tokens, chainId])

    const getToken = useMemo(
        () =>
            (addr: string, fallbackSymbol: string, decimals: number): Token => {
                const lc = addr.toLowerCase()
                return (
                    tokenLookup.get(lc) ?? {
                        address: addr as Address,
                        symbol: fallbackSymbol || addr.slice(0, 6) + '...',
                        name: '',
                        decimals,
                        chainId,
                    }
                )
            },
        [tokenLookup, chainId]
    )

    const metricsList = useMemo(() => metrics ?? [], [metrics])

    const metricsByAddress = useMemo(() => {
        const map = new Map<string, PoolMetrics>()
        for (const entry of metricsList) map.set(entry.address.toLowerCase(), entry)
        return map
    }, [metricsList])

    const pools = useMemo<V3PoolData[]>(() => {
        return metricsList
            .filter((pool) => pool.liquidity !== 0n)
            .map(
                (pool) =>
                    ({
                        address: pool.address as Address,
                        token0: getToken(
                            pool.token0.address,
                            pool.token0.symbol,
                            pool.token0.decimals
                        ),
                        token1: getToken(
                            pool.token1.address,
                            pool.token1.symbol,
                            pool.token1.decimals
                        ),
                        fee: pool.fee,
                        liquidity: pool.liquidity,
                        sqrtPriceX96: pool.sqrtPriceX96,
                        tick: pool.tick ?? 0,
                        tickSpacing: pool.tickSpacing,
                    }) satisfies V3PoolData
            )
    }, [metricsList, getToken])

    if (!isIndexed) {
        return { pools: [], metricsByAddress: new Map(), isLoading: false }
    }

    return { pools, metricsByAddress, isLoading }
}
