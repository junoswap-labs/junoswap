import type { Address } from 'viem'

/**
 * Token created on the bonding curve
 */
export interface LaunchToken {
    address: Address
    name: string
    symbol: string
    logo: string
    description: string
    link1: string
    link2: string
    link3: string
    creator: Address
    createdTime: number
    chainId: number
    graduatedAt?: number | null
    isGraduated?: boolean
}

/**
 * Sort options for the launchpad token list
 */
export type LaunchpadSortKey = 'last-trade' | 'market-cap' | 'new' | 'oldest'

/**
 * Token creation form state
 */
export interface CreateTokenForm {
    name: string
    symbol: string
    logo: string
    description: string
    link1: string
    link2: string
    link3: string
    upfrontBuyAmount: string
}

/**
 * Launchpad settings (persisted)
 */
export interface LaunchpadSettings {
    slippageBps: number // basis points, 100 = 1%
}

/**
 * Default launchpad settings
 */
export const DEFAULT_LAUNCHPAD_SETTINGS: LaunchpadSettings = {
    slippageBps: 100, // 1%
}

/**
 * Swap event enriched with token metadata for the activity feed
 */
export interface EnrichedSwapEvent {
    blockNumber: bigint
    logIndex: number
    timestamp: number
    sender: Address
    isBuy: boolean
    tokenAddr: Address
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
    transactionHash: `0x${string}`
    tokenSymbol: string
    tokenName: string
    tokenLogo: string
}
