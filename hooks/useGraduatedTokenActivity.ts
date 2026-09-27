'use client'

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchBondingCurvePricesSince, fetchTokenV3Swaps } from '@coshi190/juno-moneta-sdk'
import { computePoolPrice } from '@/lib/tick-math'
import { TOTAL_SUPPLY } from '@/lib/launchpad-curve'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import {
    aggregatePricePoints,
    buildHourlySparkline,
    computeDailyMetrics,
    type PricePoint,
} from '@/services/launchpad/chart'

const DAY_SECONDS = 86400

export interface GraduatedTokenActivity {
    lastSwapAt: number
    priceChange1dPct: number | null
    marketCap: number | null
    athMarketCap: number | null
    sparklinePath: string | null
}

export interface GraduatedTokenInput {
    address: Address
    graduatedAt: number | null
}

// The indexer's TokenSnapshot aggregate can stall after graduation on some chains (it never
// re-syncs from post-graduation V3 swaps), so lastSwapAt/priceChange1dPct are recomputed here
// straight from the raw bonding-curve + V3 swap tables instead — the same tables the token detail
// chart already reads, stitched across the graduation boundary the same way.
async function fetchTokenActivity(
    tokenAddr: string,
    chainId: number,
    graduatedAt: number | null,
    since: number
): Promise<GraduatedTokenActivity> {
    try {
        // Full history via fetchTokenV3Swaps page 'all' (auto-paginates, same query the token
        // detail page uses), not fetchV3PricesSince -- that one is a single unpaginated page capped
        // at 1000 rows ordered oldest-first, so any token with >1000 post-graduation swaps silently
        // lost everything after the 1000th (breaking both the 24h-change recency and the ATH, which
        // is why the list page's ATH used to read lower than the detail page's true full-history
        // max).
        const { items: v3Points } = await fetchTokenV3Swaps(ponderClient, {
            tokenAddr,
            chainId,
            orderDirection: 'asc',
            page: 'all',
        })
        const points: PricePoint[] = v3Points.map((e) => ({
            timestamp: e.timestamp,
            price: computePoolPrice({
                sqrtPriceX96: BigInt(e.sqrtPriceX96),
                decimals0: 18,
                decimals1: 18,
                invert: e.tokenIsToken0 !== 1,
            }),
        }))

        if (graduatedAt !== null && graduatedAt >= since) {
            const bcPoints = await fetchBondingCurvePricesSince(ponderClient, { tokenAddr, since })
            for (const e of bcPoints) {
                if (e.timestamp >= graduatedAt) continue
                points.push({
                    timestamp: e.timestamp,
                    price: Number(e.priceNative),
                })
            }
            points.sort((a, b) => a.timestamp - b.timestamp)
        }

        const hourly = aggregatePricePoints(points, '1h')
        const metrics = computeDailyMetrics(hourly, null)

        let athPrice = 0
        for (const p of points) if (p.price > athPrice) athPrice = p.price
        const athMarketCap = athPrice > 0 ? athPrice * TOTAL_SUPPLY : null

        const sparklinePath = buildHourlySparkline(hourly)

        const latest = await fetchTokenV3Swaps(ponderClient, {
            tokenAddr,
            chainId,
            page: { limit: 1, offset: 0 },
        })
        const latestSwap = latest.items[0]
        const lastSwapAt = latestSwap?.timestamp ?? graduatedAt ?? 0

        // The most recent swap's own sqrtPriceX96 is the live price regardless of whether it
        // falls inside the `since` (1d) window used for priceChange1dPct above -- so a token with
        // no trades in the last 24h still gets its real last-known price instead of nothing.
        const marketCap = latestSwap
            ? computePoolPrice({
                  sqrtPriceX96: BigInt(latestSwap.sqrtPriceX96),
                  decimals0: 18,
                  decimals1: 18,
                  invert: latestSwap.tokenIsToken0 !== 1,
              }) * TOTAL_SUPPLY
            : null

        return {
            lastSwapAt,
            priceChange1dPct: metrics?.priceChange1dPct ?? null,
            marketCap,
            athMarketCap,
            sparklinePath,
        }
    } catch (e) {
        if (isPonderError(e))
            return {
                lastSwapAt: graduatedAt ?? 0,
                priceChange1dPct: null,
                marketCap: null,
                athMarketCap: null,
                sparklinePath: null,
            }
        throw e
    }
}

/** Live lastSwapAt/priceChange1dPct for graduated tokens, keyed by lowercased address. */
export function useGraduatedTokenActivity(
    tokens: GraduatedTokenInput[],
    chainId: number
): { activity: Map<string, GraduatedTokenActivity>; isPending: boolean } {
    const since = useMemo(() => Math.floor(Date.now() / 60_000) * 60 - DAY_SECONDS, [])

    const queries = useQueries({
        queries: tokens.map((t) => ({
            queryKey: ['graduated-token-activity', chainId, t.address.toLowerCase(), since],
            queryFn: () =>
                fetchTokenActivity(t.address.toLowerCase(), chainId, t.graduatedAt, since),
            staleTime: 30_000,
            refetchInterval: 30_000,
        })),
    })

    const activity = useMemo(() => {
        const map = new Map<string, GraduatedTokenActivity>()
        tokens.forEach((t, i) => {
            const data = queries[i]?.data
            if (data) map.set(t.address.toLowerCase(), data)
        })
        return map
    }, [tokens, queries])
    return { activity, isPending: queries.some((q) => q.isPending) }
}
