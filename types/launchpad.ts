import type { Address } from 'viem'

export type LaunchpadPlatform = 'junoswap' | 'durianfun'

export interface LaunchToken {
    address: Address
    name: string
    symbol: string
    logo: string
    description: string
    link1: string
    link2: string
    link3: string
    link4: string
    creator: Address
    createdTime: number
    chainId: number
    graduatedAt?: number | null
    isGraduated?: boolean
    /** Which launchpad minted this token. Absent means 'junoswap' (the original source). */
    platform?: LaunchpadPlatform
    /** The indexer's launchpad id, which names the exact curve deployment this token trades on.
     *  Several ids (junoswap, junoswap-v1_1) share the 'junoswap' platform. */
    launchpadId?: string
    /** Third-party bonding-curve market contract for this token, pre-graduation. */
    market?: Address
    /** Graduated pool address, indexed for any platform — read this instead of guessing a
     *  fee tier to find the pool. */
    ammPool?: Address
    graduationTarget?: number | null
}

export type LaunchpadSortKey = 'last-trade' | 'market-cap' | 'new' | 'oldest'

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

export interface SwapEventData {
    blockNumber: bigint
    timestamp: number
    sender: Address
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
    transactionHash: `0x${string}`
    tokenAddr: Address
}

export interface HolderData {
    address: Address
    balance: bigint
    percentage: number
}
