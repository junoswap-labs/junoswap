'use client'

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fetchTokenCandles } from '@coshi190/juno-moneta-sdk'
import { ponderClient } from '@/lib/ponder-client'
import {
    buildHourlySparkline,
    buildSparklinePath,
    SPARKLINE_HOURS,
} from '@/services/launchpad/chart'

/** Token-card sparklines for tokens still on the bonding curve, keyed by lowercased address.
 *  Reads the indexer's pre-aggregated hourly candles (<=168 rows per token) rather than raw swaps,
 *  since this runs once per card on the list page. */
export function useCurveTokenSparklines(
    tokenAddrs: string[],
    chainId: number
): { sparklines: Map<string, string | null>; isPending: boolean } {
    const queries = useQueries({
        queries: tokenAddrs.map((addr) => ({
            queryKey: ['curve-token-sparkline', chainId, addr.toLowerCase()],
            queryFn: async () => {
                const rows = await fetchTokenCandles(ponderClient, {
                    tokenAddr: addr.toLowerCase(),
                    chainId,
                    source: 'bc',
                    duration: 3600,
                    since: Math.floor(Date.now() / 1000) - SPARKLINE_HOURS * 3600,
                })
                // No trades in the window: price hasn't moved, so a flat line is the truthful chart.
                if (rows.length === 0) return buildSparklinePath([1, 1])
                return buildHourlySparkline(
                    rows.map((r) => ({
                        time: r.bucketTs,
                        open: r.open,
                        high: r.high,
                        low: r.low,
                        close: r.close,
                        volume: 0,
                    }))
                )
            },
            staleTime: 60_000,
            refetchInterval: 60_000,
        })),
    })

    const sparklines = useMemo(() => {
        const map = new Map<string, string | null>()
        tokenAddrs.forEach((addr, i) => {
            const data = queries[i]?.data
            if (data !== undefined) map.set(addr.toLowerCase(), data)
        })
        return map
    }, [tokenAddrs, queries])
    return { sparklines, isPending: queries.some((q) => q.isPending) }
}
