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

export interface ActivityEvent {
    id: string
    /** Discriminator for merged feed rendering. */
    kind: 'trade' | 'transfer'
    tokenAddr: string
    tokenSymbol: string
    tokenName: string
    tokenLogo: string
    /** trade-only */
    isBuy: boolean
    amountIn: string
    amountOut: string
    /** transfer-only — 'in' = received, 'out' = sent */
    direction?: 'in' | 'out'
    counterparty?: string
    transferAmount?: string
    timestamp: number
    transactionHash: string
    sender: string
}
