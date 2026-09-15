import type { Address } from 'viem'
import type { Token } from '@/types/token'
import type { DEXType } from '@/lib/dex-meta'
import type { QuoteResult } from './swap'

/** The AMM generation a route trades through. */
export type Protocol = 'v2' | 'v3'
export interface SwapRoute {
    path: Address[]
    fees?: number[]
    pools?: Address[]
    isMultiHop: boolean
    intermediaryTokens: Token[]
}

export interface RouteQuote {
    route: SwapRoute
    quote: QuoteResult
    dexId: DEXType
    protocolType: Protocol
    priceImpact?: number
}

export interface RoutingResult {
    directRoute: RouteQuote | null
    multiHopRoutes: RouteQuote[]
    bestRoute: RouteQuote | null
    allRoutes: RouteQuote[]
}

export interface IntermediaryConfig {
    wrappedNative: Address
    stables: Address[]
    priority: Address[]
}
