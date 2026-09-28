'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchV3Tokens, fetchNativeUsdPrice } from '@coshi190/juno-moneta-sdk'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { ponderClient, isPonderError } from '@/lib/ponder-client'

export function useTokenPriceMap(chainId: number) {
    const config = INTERMEDIARY_TOKENS[chainId]

    const { data: snapshots, isLoading: isLoadingSnapshots } = useQuery({
        queryKey: ['v3-token-snapshots', chainId],
        queryFn: async () => {
            try {
                return await fetchV3Tokens(ponderClient, { chainId, prices: true })
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        staleTime: 30_000,
    })

    const { data: nativeUsdPrice, isLoading: isLoadingNative } = useQuery({
        queryKey: ['native-usd-price', chainId],
        queryFn: async () => {
            try {
                return await fetchNativeUsdPrice(ponderClient, { chainId })
            } catch (e) {
                if (isPonderError(e)) return null
                throw e
            }
        },
        staleTime: 30_000,
    })

    const priceMap = useMemo(() => {
        const map = new Map<string, number>()

        const wrappedNative = config?.wrappedNative?.toLowerCase()
        if (wrappedNative && nativeUsdPrice != null && nativeUsdPrice > 0) {
            map.set(wrappedNative, nativeUsdPrice)
        }

        for (const s of snapshots ?? []) {
            const price = parseFloat(s.lastPriceUsd ?? '0')
            if (price > 0) {
                map.set(s.address.toLowerCase(), price)
            }
        }

        for (const stable of config?.stables ?? []) {
            map.set(stable.toLowerCase(), 1.0)
        }

        return map
    }, [snapshots, nativeUsdPrice, config])

    return {
        priceMap,
        isLoading: isLoadingSnapshots || isLoadingNative,
    }
}
