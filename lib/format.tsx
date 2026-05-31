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
 * Format a token liquidity amount with adaptive decimal precision for display.
 *
 * >= 1,000 : no decimals with locale separator (e.g. 10,097)
 * 1–999    : 2 decimal places (e.g. 852.30)
 * < 1      : 3 significant figures (e.g. 0.000155)
 */
export function formatLiquidityAmount(value: bigint, decimals: number): string {
    const num = Number(value) / Math.pow(10, decimals)
    if (num === 0) return '0'
    if (num >= 1_000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 })
    if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    const leadingZeros = Math.max(0, -Math.floor(Math.log10(num)) - 1)
    return num.toFixed(leadingZeros + 3)
}

/**
 * Format a token reward amount with adaptive decimal precision.
 *
 * < 1   : show 3 significant figures (e.g. 0.000001559… → 0.00000155)
 * 1–9   : 2 decimal places (e.g. 1 → 1.00)
 * 10–99 : 1 decimal place  (e.g. 10 → 10.0)
 * ≥ 100 : no decimals      (e.g. 100 → 100)
 */
export function formatRewardAmount(value: bigint, decimals: number): string {
    if (value === 0n) return '0'
    const num = Number(value) / Math.pow(10, decimals)
    if (num === 0) return '0'
    if (num >= 100) return num.toFixed(0)
    if (num >= 10) return num.toFixed(1)
    if (num >= 1) return num.toFixed(2)
    // < 1: find leading zeros after decimal, then show 3 significant figures
    const leadingZeros = Math.max(0, -Math.floor(Math.log10(num)) - 1)
    return num.toFixed(leadingZeros + 3)
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
