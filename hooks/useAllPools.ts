'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { getTokensForChain } from '@/lib/tokens'
import { getTickSpacing } from '@/lib/liquidity-helpers'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import type { V3PoolData } from '@/types/earn'
import type { Token } from '@/types/tokens'

export const PONDER_INDEXED_CHAINS = new Set([25925, 96, 8899])

interface V3PoolRow {
    address: string
    token0: string
    token1: string
    fee: number
}

interface V3PoolResponse {
    v3Pools: {
        items: Array<V3PoolRow>
    }
}

interface V3TokenResponse {
    v3Tokens: {
        items: Array<{
            address: string
            symbol: string
            name: string
            decimals: number
        }>
    }
}

const V3_POOLS_QUERY = `
  query V3PoolsForChain($chainId: Int!) {
    v3Pools(where: { chainId: $chainId }, limit: 500) {
      items {
        address
        token0
        token1
        fee
      }
    }
  }
`

const V3_TOKENS_QUERY = `
  query V3TokensForChain($chainId: Int!) {
    v3Tokens(where: { chainId: $chainId }, limit: 500) {
      items {
        address
        symbol
        name
        decimals
      }
    }
  }
`

export function useAllPools(chainId: number): { pools: V3PoolData[]; isLoading: boolean } {
    const isIndexed = PONDER_INDEXED_CHAINS.has(chainId)

    const staticTokens = useMemo(() => getTokensForChain(chainId), [chainId])
    const { tokens: graduatedTokens } = useGraduatedTokens(chainId)

    const { data: ponderPools, isLoading: isLoadingPools } = useQuery({
        queryKey: ['v3-pools-all', chainId],
        queryFn: async () => {
            try {
                const data = await ponderRequest<V3PoolResponse>(V3_POOLS_QUERY, { chainId })
                return data.v3Pools.items
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: isIndexed,
        staleTime: 60_000,
    })

    const { data: v3Tokens } = useQuery({
        queryKey: ['v3-tokens', chainId],
        queryFn: async () => {
            try {
                const data = await ponderRequest<V3TokenResponse>(V3_TOKENS_QUERY, { chainId })
                return data.v3Tokens.items
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: isIndexed,
        staleTime: 60_000,
    })

    // Build token lookup: static > graduated > v3Tokens > minimal placeholder
    const tokenLookup = useMemo(() => {
        const map = new Map<string, Token>()
        const add = (t: Token) => {
            const key = t.address.toLowerCase()
            if (!map.has(key)) map.set(key, t)
        }
        for (const t of staticTokens) add(t)
        for (const t of graduatedTokens) add(t)
        for (const t of v3Tokens ?? []) {
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
            (addr: string): Token => {
                const lc = addr.toLowerCase()
                return (
                    tokenLookup.get(lc) ?? {
                        address: addr as Address,
                        symbol: addr.slice(0, 6) + '...',
                        name: '',
                        decimals: 18,
                        chainId,
                    }
                )
            },
        [tokenLookup, chainId]
    )

    // Batch slot0 + liquidity for all discovered pools
    const poolList = useMemo(() => ponderPools ?? [], [ponderPools])
    const { data: poolStateResults, isLoading: isLoadingState } = useReadContracts({
        contracts: poolList.flatMap((pool) => [
            {
                address: pool.address as Address,
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'slot0' as const,
                chainId,
            },
            {
                address: pool.address as Address,
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'liquidity' as const,
                chainId,
            },
        ]),
        query: {
            enabled: poolList.length > 0 && isIndexed,
            staleTime: 10_000,
        },
    })

    const pools = useMemo<V3PoolData[]>(() => {
        if (!poolStateResults || poolList.length === 0) return []
        return poolList
            .map((pool, i) => {
                const slot0 = poolStateResults[i * 2]?.result as
                    | [bigint, number, number, number, number, number, boolean]
                    | undefined
                const liquidity = poolStateResults[i * 2 + 1]?.result as bigint | undefined
                if (!slot0 || liquidity === undefined || liquidity === 0n) return null

                const [sqrtPriceX96, tick] = slot0
                return {
                    address: pool.address as Address,
                    token0: getToken(pool.token0),
                    token1: getToken(pool.token1),
                    fee: pool.fee,
                    liquidity,
                    sqrtPriceX96,
                    tick,
                    tickSpacing: getTickSpacing(pool.fee),
                } satisfies V3PoolData
            })
            .filter((p): p is V3PoolData => p !== null)
    }, [poolStateResults, poolList, getToken])

    if (!isIndexed) {
        return { pools: [], isLoading: false }
    }

    return {
        pools,
        isLoading: isLoadingPools || isLoadingState,
    }
}
