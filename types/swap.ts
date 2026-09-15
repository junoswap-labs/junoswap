import type { Address } from 'viem'
import type { Token } from '@/types/token'
import type { DEXType } from '@/lib/dex-meta'
import type { SwapRoute } from './routing'
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
    protocolType: 'v2' | 'v3'
    fee?: number // For V3 protocols
    priceImpact?: number
    route?: SwapRoute // Route information for multi-hop swaps
    isMultiHop?: boolean
}

export interface SwapResult {
    hash: Address
    amountOut: bigint
    status: 'pending' | 'success' | 'error'
    error?: string
}

type SlippagePreset = '0.1' | '0.5' | '1' | 'custom'

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

export interface SwapUrlParams {
    input?: string // Token address
    output?: string // Token address
    amount?: string // Input amount as decimal string
    chain?: string // Chain ID as string
    ref?: string // Referrer address for calldata tracking
}

export interface ParsedSwapUrlParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: string
    targetChainId: number | null // Chain ID from URL param
    isValid: boolean
    errors: string[]
}
