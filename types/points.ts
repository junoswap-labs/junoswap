import type { LeaderboardTimePeriod, SortDirection } from './leaderboard'

export type { SortDirection }
export type PointsTimePeriod = LeaderboardTimePeriod
export type PointsSortKey = 'points' | 'volume' | 'trades'

export interface PointsTrader {
    rank: number
    address: string
    volumeNative: number
    volumeUsd: number
    points: number
    tradeCount: number
    buyCount: number
    sellCount: number
}

export type PointsTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface PointsTierConfig {
    name: PointsTier
    minPoints: number
    maxPoints: number
    color: string
    bg: string
    border: string
    label: string
}

export const TIER_THRESHOLDS: PointsTierConfig[] = [
    {
        name: 'bronze',
        minPoints: 0,
        maxPoints: 99,
        color: 'text-amber-700 dark:text-amber-400',
        bg: 'bg-amber-500/20 dark:bg-amber-900/30',
        border: 'border-amber-400/40 dark:border-amber-500/30',
        label: 'Bronze',
    },
    {
        name: 'silver',
        minPoints: 100,
        maxPoints: 999,
        color: 'text-slate-600 dark:text-slate-300',
        bg: 'bg-slate-400/20 dark:bg-slate-700/30',
        border: 'border-slate-400/40 dark:border-slate-400/30',
        label: 'Silver',
    },
    {
        name: 'gold',
        minPoints: 1_000,
        maxPoints: 9_999,
        color: 'text-yellow-600 dark:text-yellow-400',
        bg: 'bg-yellow-400/20 dark:bg-yellow-900/30',
        border: 'border-yellow-400/40 dark:border-yellow-500/30',
        label: 'Gold',
    },
    {
        name: 'platinum',
        minPoints: 10_000,
        maxPoints: 49_999,
        color: 'text-cyan-700 dark:text-cyan-400',
        bg: 'bg-cyan-400/20 dark:bg-cyan-900/30',
        border: 'border-cyan-400/40 dark:border-cyan-500/30',
        label: 'Platinum',
    },
    {
        name: 'diamond',
        minPoints: 50_000,
        maxPoints: Infinity,
        color: 'text-violet-700 dark:text-violet-400',
        bg: 'bg-violet-400/20 dark:bg-violet-900/30',
        border: 'border-violet-400/40 dark:border-violet-500/30',
        label: 'Diamond',
    },
]

export function getTierForPoints(points: number): PointsTierConfig {
    for (const tier of TIER_THRESHOLDS) {
        if (points >= tier.minPoints && points <= tier.maxPoints) return tier
    }
    return TIER_THRESHOLDS[0]!
}

export interface PointsSettings {
    timePeriod: PointsTimePeriod
    sortKey: PointsSortKey
    sortDirection: SortDirection
}
