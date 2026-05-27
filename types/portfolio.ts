import type { Token } from './tokens'

export type TokenType = 'static' | 'graduated' | 'bonding_curve'

export interface PortfolioToken {
    token: Token
    balance: bigint
    formattedBalance: string
    priceUsd: number | null
    valueUsd: number
    pnlUsd: number | null
    pnlPercent: number | null
    tokenType: TokenType
}

export interface PortfolioSummary {
    netWorth: number
    totalPnl: number | null
    totalPnlPercent: number | null
}

export type PortfolioSortKey = 'value' | 'balance' | 'pnl' | 'name'
export type SortDirection = 'asc' | 'desc'

export interface PortfolioSettings {
    sortBy: PortfolioSortKey
    sortDirection: SortDirection
    hideSmallBalances: boolean
    smallBalanceThreshold: number
}
