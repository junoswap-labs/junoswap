import type { Address } from 'viem'
import type { Token } from './tokens'
import type { DEXType } from './dex'
import type { QuoteResult } from './swap'
import type { ProtocolType } from '@/lib/dex-config'

export interface SwapRoute {
    /** Token addresses in order [tokenIn, ...intermediaries, tokenOut] */
    path: Address[]
    /** Fee tiers for V3 (length = path.length - 1) */
    fees?: number[]
    pools?: Address[]
    /** True when path.length > 2, i.e. the route has intermediary hops */
    isMultiHop: boolean
    intermediaryTokens: Token[]
}

export interface RouteQuote {
    route: SwapRoute
    quote: QuoteResult
    dexId: DEXType
    protocolType: ProtocolType
    priceImpact?: number
}

export interface RoutingResult {
    directRoute: RouteQuote | null
    multiHopRoutes: RouteQuote[]
    bestRoute: RouteQuote | null
    /** allRoutes sorted by output amount, best first */
    allRoutes: RouteQuote[]
}

export interface IntermediaryConfig {
    wrappedNative: Address
    stables: Address[]
    /** Order in which intermediaries are tried when building multi-hop routes */
    priority: Address[]
}
