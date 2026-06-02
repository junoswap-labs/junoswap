'use client'

import { useMemo } from 'react'
import type { Token } from '@/types/tokens'
import type { RoutingResult, RouteQuote } from '@/types/routing'
import type { Address } from 'viem'
import { ProtocolType } from '@/lib/dex-config'
import { useUniV3Quote } from './useUniV3Quote'
import { useUniV2Quote } from './useUniV2Quote'
import { useUniV3MultiHopQuote } from './useUniV3MultiHopQuote'
import { useUniV2MultiHopQuote } from './useUniV2MultiHopQuote'
import { MIN_MULTIHOP_IMPROVEMENT_BPS } from '@/lib/routing-config'

interface UseSwapRoutingParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    preferMultiHop?: boolean
}

interface UseSwapRoutingResult extends RoutingResult {
    isLoading: boolean
    isError: boolean
    error: Error | null
}

export function useSwapRouting({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    preferMultiHop = false,
}: UseSwapRoutingParams): UseSwapRoutingResult {
    const v3Direct = useUniV3Quote({ tokenIn, tokenOut, amountIn, enabled })
    const v2DirectResult = useUniV2Quote({ tokenIn, tokenOut, amountIn, enabled })
    const v2PrimaryQuote = v2DirectResult.primaryDexId
        ? v2DirectResult.quotes[v2DirectResult.primaryDexId]
        : null
    const shouldTryMultiHop = useMemo(() => {
        if (preferMultiHop) return true
        const hasV3Direct = v3Direct.quote && !v3Direct.isError
        const hasV2Direct = v2PrimaryQuote?.quote && !v2PrimaryQuote?.isError
        return !hasV3Direct && !hasV2Direct
    }, [
        preferMultiHop,
        v3Direct.quote,
        v3Direct.isError,
        v2PrimaryQuote?.quote,
        v2PrimaryQuote?.isError,
    ])
    const v3MultiHop = useUniV3MultiHopQuote({
        tokenIn,
        tokenOut,
        amountIn,
        enabled: enabled && shouldTryMultiHop,
    })
    const v2MultiHop = useUniV2MultiHopQuote({
        tokenIn,
        tokenOut,
        amountIn,
        enabled: enabled && shouldTryMultiHop,
    })
    const directRoutes = useMemo(() => {
        const routes: RouteQuote[] = []
        if (v3Direct.quote && v3Direct.primaryDexId) {
            routes.push({
                route: {
                    path: [tokenIn?.address, tokenOut?.address].filter(Boolean) as Address[],
                    fees: v3Direct.fee ? [v3Direct.fee] : undefined,
                    isMultiHop: false,
                    intermediaryTokens: [],
                },
                quote: v3Direct.quote,
                dexId: v3Direct.primaryDexId,
                protocolType: ProtocolType.V3,
            })
        }
        if (v2PrimaryQuote?.quote && v2DirectResult.primaryDexId) {
            routes.push({
                route: {
                    path: [tokenIn?.address, tokenOut?.address].filter(Boolean) as Address[],
                    isMultiHop: false,
                    intermediaryTokens: [],
                },
                quote: v2PrimaryQuote.quote,
                dexId: v2DirectResult.primaryDexId,
                protocolType: ProtocolType.V2,
            })
        }
        return routes
    }, [v3Direct, v2PrimaryQuote, v2DirectResult.primaryDexId, tokenIn, tokenOut])
    const result = useMemo((): RoutingResult => {
        const allMultiHop = [...v3MultiHop.routes, ...v2MultiHop.routes]
        const allRoutes = [...directRoutes, ...allMultiHop].sort((a, b) =>
            Number(b.quote.amountOut - a.quote.amountOut)
        )
        const directRoute =
            directRoutes.sort((a, b) => Number(b.quote.amountOut - a.quote.amountOut))[0] ?? null
        let bestRoute = allRoutes[0] ?? null
        if (directRoute && bestRoute?.route.isMultiHop) {
            const directAmount = directRoute.quote.amountOut
            const multiHopAmount = bestRoute.quote.amountOut
            const improvementBps = Number(((multiHopAmount - directAmount) * 10000n) / directAmount)
            if (improvementBps < MIN_MULTIHOP_IMPROVEMENT_BPS) {
                bestRoute = directRoute
            }
        }
        return {
            directRoute,
            multiHopRoutes: allMultiHop,
            bestRoute,
            allRoutes,
        }
    }, [directRoutes, v3MultiHop.routes, v2MultiHop.routes])
    const isLoading =
        v3Direct.isLoading ||
        v2DirectResult.isLoading ||
        (shouldTryMultiHop && (v3MultiHop.isLoading || v2MultiHop.isLoading))
    const isError =
        v3Direct.isError &&
        (v2PrimaryQuote?.isError ?? true) &&
        (!shouldTryMultiHop || (v3MultiHop.isError && v2MultiHop.isError))
    const error = v3Direct.error || v2PrimaryQuote?.error || v3MultiHop.error || v2MultiHop.error
    return {
        ...result,
        isLoading,
        isError,
        error,
    }
}
