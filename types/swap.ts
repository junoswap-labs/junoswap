import type { Address } from 'viem'
import type { DEXType } from './dex'
import type { SwapRoute } from './routing'
import { ProtocolType } from '@/lib/dex-config'

export interface SwapParams {
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    amountOutMinimum: bigint
    recipient: Address
    slippageTolerance: number // in basis points (100 = 1%, 500 = 5%)
    deadline: number // Unix timestamp in seconds
    path?: Address[] // Full multi-hop path [tokenIn, ...intermediaries, tokenOut]
    fees?: number[] // Fee tiers for V3 multi-hop (length = path.length - 1)
}

export interface QuoteResult {
    amountOut: bigint
    sqrtPriceX96After: bigint
    initializedTicksCrossed: number
    gasEstimate: bigint
}

export interface DexQuote {
    dexId: DEXType
    quote: QuoteResult | null
    isLoading: boolean
    isError: boolean
    error: Error | null
    protocolType: ProtocolType.V2 | ProtocolType.V3
    fee?: number // For V3 protocols
    route?: SwapRoute // Route information for multi-hop swaps
    isMultiHop?: boolean
}

export interface SwapResult {
    hash: Address
    amountOut: bigint
    status: 'pending' | 'success' | 'error'
    error?: string
}

export type SlippagePreset = '0.1' | '0.5' | '1' | 'custom'

export interface SwapSettings {
    slippage: number // in percentage (0.1, 0.5, 1, etc.)
    slippagePreset: SlippagePreset
    deadlineMinutes: number
    expertMode: boolean
    autoSelectBestDex: boolean
}

export interface SwapState {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: string
    amountOut: string
    quote: QuoteResult | null
    isLoading: boolean
    error: string | null
    isUpdatingFromUrl: boolean
}

/** URL format: /swap?input={address}&output={address}&amount={string}&chain={chainId} */
export interface SwapUrlParams {
    input?: string // Token address
    output?: string // Token address
    amount?: string // Input amount as decimal string
    chain?: string // Chain ID as string
}

export interface ParsedSwapUrlParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: string
    targetChainId: number | null // Chain ID from URL param
    isValid: boolean
    errors: string[]
}

import type { Token } from './tokens'
