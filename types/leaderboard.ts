export type LeaderboardTimePeriod = '24h' | '7d' | '30d' | 'all'

export type TraderSortKey = 'netWorth' | 'pnl' | 'volume' | 'trades'

export type SortDirection = 'asc' | 'desc'

export interface LeaderboardTrader {
    rank: number
    address: string
    netWorthNative: number
    pnlNative: number
    pnlPercent: number
    volumeNative: number
    tradeCount: number
    buyCount: number
    sellCount: number
}

export interface LeaderboardSettings {
    timePeriod: LeaderboardTimePeriod
    sortKey: TraderSortKey
    sortDirection: SortDirection
}
