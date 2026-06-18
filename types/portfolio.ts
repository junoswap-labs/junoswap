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

/** One side of a generalized (token/token) trade — used when neither leg is native. */
export interface ActivityLeg {
    tokenAddr: string
    symbol: string
    logo: string
    /** raw on-chain amount (bigint string) */
    amount: string
    decimals: number
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
    /**
     * Generalized two-leg display for external token/token swaps (no forced native
     * leg). When present, the row renders `sell`/`buy` directly instead of the
     * native-centric isBuy/amountIn/amountOut model.
     */
    sell?: ActivityLeg
    buy?: ActivityLeg
    /** trade-only — liquidity source dexId (e.g. 'junoswap', 'kublerx', 'udonswap') */
    protocol?: string
    /** transfer-only — 'in' = received, 'out' = sent */
    direction?: 'in' | 'out'
    counterparty?: string
    transferAmount?: string
    timestamp: number
    transactionHash: string
    sender: string
}
