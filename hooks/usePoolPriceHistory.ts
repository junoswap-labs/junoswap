'use client'

import { useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchPoolPriceHistory } from '@coshi190/juno-moneta-sdk'
import { ponderClient } from '@/lib/ponder-client'
import { RANGE_CHART_WINDOW_SEC } from '@/lib/position-chart'
import type { PoolSwapPoint } from '@/lib/position-chart'

export interface PoolPriceHistory {
    events: PoolSwapPoint[]
    anchor: PoolSwapPoint | null
    isLoading: boolean
}

export function usePoolPriceHistory(poolAddress: Address | undefined): PoolPriceHistory {
    const chainId = useChainId()

    const { data, isLoading } = useQuery({
        queryKey: ['pool-price-history', chainId, poolAddress?.toLowerCase()],
        queryFn: () =>
            fetchPoolPriceHistory(ponderClient, {
                poolAddress: poolAddress!.toLowerCase(),
                chainId,
                since: Math.floor(Date.now() / 1000) - RANGE_CHART_WINDOW_SEC,
            }).catch(() => ({ events: [] as PoolSwapPoint[], anchor: null })),
        enabled: !!poolAddress,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    return {
        events: data?.events ?? [],
        anchor: data?.anchor ?? null,
        isLoading,
    }
}
