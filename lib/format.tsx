import type { ReactNode } from 'react'

/**
 * Format a USD TVL value for display
 */
export function formatTvl(tvlUsd: number): string {
    if (tvlUsd <= 0) return '$0.00'
    if (tvlUsd >= 1_000_000) return `$${(tvlUsd / 1_000_000).toFixed(2)}M`
    if (tvlUsd >= 1_000) return `$${(tvlUsd / 1_000).toFixed(2)}K`
    return `$${tvlUsd.toFixed(2)}`
}

/**
 * Format an APR percentage for display, with loading and edge-case states
 */
export function formatApr(apr: number | null, isLoading: boolean): ReactNode {
    if (isLoading) {
        return <div className="h-4 w-16 bg-muted rounded animate-pulse" />
    }
    if (apr === null || apr === 0) {
        return <span className="text-sm text-muted-foreground">--</span>
    }
    if (apr >= 100) {
        return (
            <span className="text-sm font-medium">
                {apr.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
            </span>
        )
    }
    if (apr >= 0.01) {
        return <span className="text-sm font-medium">{apr.toFixed(2)}%</span>
    }
    return <span className="text-sm font-medium">&lt;0.01%</span>
}

/**
 * Calculate APR from pool fee, TVL, and 30-day volume
 * APR = ((dailyAvgVolume * feeRate) / TVL) * 365 * 100
 */
export function calculateApr(poolFee: number, tvl: number, volume30d: number): number | null {
    if (!tvl || tvl <= 0 || !volume30d || volume30d <= 0) return null
    const dailyAvgVolume = volume30d / 30
    return ((dailyAvgVolume * (poolFee / 1_000_000)) / tvl) * 365 * 100
}
