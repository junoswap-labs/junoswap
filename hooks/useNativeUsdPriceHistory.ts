'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'

export interface NativeUsdPricePoint {
    timestamp: number
    price: number
}

interface NativeUsdPriceSnapshotsPage {
    nativeUsdPriceSnapshots: {
        items: Array<{
            id: string
            price: string
            timestamp: number
        }>
    }
}

const PAGE_SIZE = 1000

const SNAPSHOTS_QUERY = `
  query NativeUsdPriceSnapshots($chainId: Int!, $after: String) {
    nativeUsdPriceSnapshots(
      where: { chainId: $chainId },
      orderBy: "timestamp",
      orderDirection: "asc",
      limit: ${PAGE_SIZE},
      after: $after
    ) {
      items {
        id
        price
        timestamp
      }
    }
  }
`

async function fetchAllSnapshots(chainId: number): Promise<NativeUsdPricePoint[]> {
    const points: NativeUsdPricePoint[] = []
    let after: string | undefined

    for (;;) {
        const data = await ponderRequest<NativeUsdPriceSnapshotsPage>(SNAPSHOTS_QUERY, {
            chainId,
            after,
        })
        const items = data.nativeUsdPriceSnapshots.items
        for (const item of items) {
            points.push({ timestamp: item.timestamp, price: parseFloat(item.price) })
        }
        if (items.length < PAGE_SIZE) break
        const last = items[items.length - 1]
        if (!last) break
        after = last.id
    }

    return points
}

/**
 * Builds a `priceAt(timestamp)` lookup over the indexed KUB/USD history so each
 * trade can be valued at the rate in effect when it happened. Binary-searches for
 * the latest point at or before the timestamp; falls back to the earliest point
 * (for trades predating the series) and then to `fallbackPrice` when no history.
 */
export function makePriceAt(
    points: NativeUsdPricePoint[],
    fallbackPrice: number | null
): (timestamp: number) => number {
    const fallback = fallbackPrice ?? 0
    if (points.length === 0) return () => fallback

    return (timestamp: number) => {
        if (timestamp < points[0]!.timestamp) return points[0]!.price
        let lo = 0
        let hi = points.length - 1
        let ans = 0
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            if (points[mid]!.timestamp <= timestamp) {
                ans = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return points[ans]!.price
    }
}

export function useNativeUsdPriceHistory(chainId: number, fallbackPrice: number | null) {
    const isLaunchpadChain = chainId === PUMP_CORE_NATIVE_CHAIN_ID

    const { data } = useQuery({
        queryKey: ['native-usd-price-history', chainId],
        queryFn: async (): Promise<NativeUsdPricePoint[]> => {
            try {
                return await fetchAllSnapshots(chainId)
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: isLaunchpadChain,
        staleTime: 5 * 60_000,
    })

    const points = useMemo(() => data ?? [], [data])
    const priceAt = useMemo(() => makePriceAt(points, fallbackPrice), [points, fallbackPrice])

    return { points, priceAt }
}
