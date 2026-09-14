'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchV3Tokens } from '@coshi190/juno-moneta-sdk'
import type { V3TokenRow } from '@/types/pools'
import { ponderClient, isPonderError } from '@/lib/ponder-client'

export function useV3Tokens(chainId: number): {
    tokens: V3TokenRow[]
    isLoading: boolean
    isSettled: boolean
} {
    const { data, isLoading } = useQuery({
        queryKey: ['v3-tokens', chainId],
        queryFn: async () => {
            try {
                return await fetchV3Tokens(ponderClient, { chainId })
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        staleTime: 60_000,
    })

    return { tokens: data ?? [], isLoading, isSettled: data !== undefined }
}
