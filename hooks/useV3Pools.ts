'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchV3Pools } from '@coshi190/juno-moneta-sdk'
import type { V3PoolRow } from '@/types/pools'
import { ponderClient, isPonderError } from '@/lib/ponder-client'

export function useV3Pools(
    chainId: number,
    enabled = true
): {
    pools: V3PoolRow[]
    isLoading: boolean
} {
    const { data, isLoading } = useQuery({
        queryKey: ['v3-pools-all', chainId],
        queryFn: async () => {
            try {
                return await fetchV3Pools(ponderClient, { chainId })
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled,
        staleTime: 60_000,
    })

    return { pools: data ?? [], isLoading }
}
