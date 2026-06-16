import type { Token } from './tokens'
import type { Route } from '@lifi/types'

/**
 * Chain IDs supported for bridging
 */
export const BRIDGE_SUPPORTED_CHAIN_IDS = [56, 8453, 480] as const // BSC, Base, Worldchain

/**
 * Default chain to switch to when wallet is on an unsupported chain
 */
export const DEFAULT_BRIDGE_CHAIN_ID = 8453 // Base

/**
 * Bridge settings
 */
export interface BridgeSettings {
    slippage: number // decimal proportion, 0.03 = 3%
}

/**
 * Bridge state for UI
 */
export interface BridgeState {
    fromChainId: number
    toChainId: number
    fromToken: Token | null
    toToken: Token | null
    amountIn: string
    quote: Route | null
    isLoading: boolean
    error: string | null
}
