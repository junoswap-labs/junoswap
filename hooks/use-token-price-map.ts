'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'

interface V3TokenSnapshotResponse {
    v3TokenSnapshots: {
        items: Array<{ tokenAddr: string; lastPriceUsd: string }>
    }
}

interface NativeUsdPriceResponse {
    nativeUsdPrices: {
        items: Array<{ chainId: number; price: string }>
    }
}

const V3_TOKEN_SNAPSHOTS_QUERY = `
  query V3TokenSnapshots($chainId: Int!) {
    v3TokenSnapshots(where: { chainId: $chainId }, limit: 500) {
      items { tokenAddr lastPriceUsd }
    }
  }
`

const NATIVE_USD_PRICE_QUERY = `
  query NativeUsdPrice($chainId: Int!) {
    nativeUsdPrices(where: { chainId: $chainId }, limit: 1) {
      items { chainId price }
    }
  }
`

/**
 * Fetches a token-address → USD-price map from Ponder for use by TVL and volume hooks.
 * Includes overrides for wrapped native (nativeUsdPrice) and stablecoins ($1.00).
 */
export function useTokenPriceMap(chainId: number) {
    const config = INTERMEDIARY_TOKENS[chainId]

    const { data: snapshots, isLoading: isLoadingSnapshots } = useQuery({
        queryKey: ['v3-token-snapshots-tvl', chainId],
        queryFn: async () => {
            try {
                const data = await ponderRequest<V3TokenSnapshotResponse>(
                    V3_TOKEN_SNAPSHOTS_QUERY,
                    { chainId }
                )
                return data.v3TokenSnapshots.items
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        staleTime: 30_000,
    })

    const { data: nativeUsdPrice, isLoading: isLoadingNative } = useQuery({
        queryKey: ['native-usd-price-tvl', chainId],
        queryFn: async () => {
            try {
                const result = await ponderRequest<NativeUsdPriceResponse>(NATIVE_USD_PRICE_QUERY, {
                    chainId,
                })
                const item = result.nativeUsdPrices.items[0]
                return item ? parseFloat(item.price) : null
            } catch (e) {
                if (isPonderError(e)) return null
                throw e
            }
        },
        staleTime: 30_000,
    })

    const priceMap = useMemo(() => {
        const map = new Map<string, number>()

        // 1. Wrapped native → nativeUsdPrice
        const wrappedNative = config?.wrappedNative?.toLowerCase()
        if (wrappedNative && nativeUsdPrice != null && nativeUsdPrice > 0) {
            map.set(wrappedNative, nativeUsdPrice)
        }

        // 2. Tokens → lastPriceUsd from v3TokenSnapshots
        for (const s of snapshots ?? []) {
            const price = parseFloat(s.lastPriceUsd)
            if (price > 0) {
                map.set(s.tokenAddr.toLowerCase(), price)
            }
        }

        // 3. Stablecoins → $1.00. Applied last so a known stablecoin is always
        // pinned to $1 and can never be overridden by a bad snapshot price (e.g. a
        // decimals-mismatched snapshot that would otherwise read in the trillions).
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
