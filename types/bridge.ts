import type { Token } from './tokens'
import type { Route } from '@lifi/types'

export const BRIDGE_SUPPORTED_CHAIN_IDS = [56, 8453, 480] as const // BSC, Base, Worldchain

/** Chain switched to when the wallet is on an unsupported chain. */
export const DEFAULT_BRIDGE_CHAIN_ID = 8453 // Base

export interface BridgeSettings {
    slippage: number // decimal proportion, 0.03 = 3%
}

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
