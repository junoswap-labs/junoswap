'use client'

import { useMemo } from 'react'
import { useChainId } from 'wagmi'
import type { Token } from '@/types/tokens'
import type { DEXType } from '@/types/dex'
import type { DexQuote } from '@/types/swap'
import type { RouteQuote } from '@/types/routing'
import {
    getSupportedDexs,
    getDexConfig,
    isV2Config,
    isV3Config,
    ProtocolType,
} from '@/lib/dex-config'
import { useUniV3Quote } from './useUniV3Quote'
import { useUniV2Quote } from './useUniV2Quote'
import { useSwapRouting } from './useSwapRouting'

interface UseMultiDexQuotesParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
}

interface UseMultiDexQuotesResult {
    dexQuotes: Record<DEXType, DexQuote>
    bestQuoteDex: DEXType | null
    isAnyLoading: boolean
    hasAnyQuote: boolean
    priceDifferences: Record<DEXType, number | null>
    bestRoute: RouteQuote | null
    isMultiHop: boolean
    allRoutes: RouteQuote[]
}

export function useMultiDexQuotes({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
}: UseMultiDexQuotesParams): UseMultiDexQuotesResult {
    const chainId = useChainId()
    const routing = useSwapRouting({
        tokenIn,
        tokenOut,
        amountIn,
        enabled,
        preferMultiHop: true,
    })
    const supportedDexs = getSupportedDexs(chainId)
    const v3Dexs = supportedDexs.filter((dexId) => {
        const config = getDexConfig(chainId, dexId)
        return config && isV3Config(config)
    })
    const v2Dexs = supportedDexs.filter((dexId) => {
        const config = getDexConfig(chainId, dexId)
        return config && isV2Config(config)
    })
    const v3Result = useUniV3Quote({
        tokenIn,
        tokenOut,
        amountIn,
        enabled,
        dexId: v3Dexs[0],
    })
    const v3Result2 = useUniV3Quote({
        tokenIn,
        tokenOut,
        amountIn,
        enabled: enabled && v3Dexs.length > 1,
        dexId: v3Dexs[1],
    })
    const v2Result = useUniV2Quote({
        tokenIn,
        tokenOut,
        amountIn,
        enabled,
        dexId: v2Dexs.length > 0 ? v2Dexs : undefined,
    })
    const quotes: Record<DEXType, DexQuote> = useMemo(() => {
        const results: Record<DEXType, DexQuote> = {}
        for (const dexId of v3Dexs) {
            results[dexId] = {
                dexId,
                quote: null,
                isLoading: false,
                isError: false,
                error: null,
                protocolType: ProtocolType.V3,
            }
        }
        for (const dexId of v2Dexs) {
            results[dexId] = {
                dexId,
                quote: null,
                isLoading: false,
                isError: false,
                error: null,
                protocolType: ProtocolType.V2,
            }
        }
        if (v3Result.primaryDexId && results[v3Result.primaryDexId]) {
            results[v3Result.primaryDexId] = {
                dexId: v3Result.primaryDexId,
                quote: v3Result.quote,
                isLoading: v3Result.isLoading,
                isError: v3Result.isError,
                error: v3Result.error,
                protocolType: ProtocolType.V3,
                fee: v3Result.fee ?? undefined,
            }
        }
        if (v3Result2.primaryDexId && results[v3Result2.primaryDexId]) {
            results[v3Result2.primaryDexId] = {
                dexId: v3Result2.primaryDexId,
                quote: v3Result2.quote,
                isLoading: v3Result2.isLoading,
                isError: v3Result2.isError,
                error: v3Result2.error,
                protocolType: ProtocolType.V3,
                fee: v3Result2.fee ?? undefined,
            }
        }
        for (const dexId of v2Dexs) {
            const v2Quote = v2Result.quotes[dexId]
            if (v2Quote) {
                results[dexId] = {
                    dexId,
                    quote: v2Quote.quote,
                    isLoading: v2Quote.isLoading,
                    isError: v2Quote.isError,
                    error: v2Quote.error,
                    protocolType: ProtocolType.V2,
                }
            }
        }
        return results
    }, [
        v3Dexs,
        v2Dexs,
        v3Result.primaryDexId,
        v3Result.quote,
        v3Result.isLoading,
        v3Result.isError,
        v3Result.error,
        v3Result.fee,
        v3Result2.primaryDexId,
        v3Result2.quote,
        v3Result2.isLoading,
        v3Result2.isError,
        v3Result2.error,
        v3Result2.fee,
        v2Result.quotes,
    ])
    const quotesWithMultiHop = useMemo(() => {
        const results = { ...quotes }
        if (routing.bestRoute?.route.isMultiHop && routing.bestRoute.quote) {
            const multiHopDexId = routing.bestRoute.dexId
            if (results[multiHopDexId]) {
                const existingQuote = results[multiHopDexId].quote
                if (!existingQuote || routing.bestRoute.quote.amountOut > existingQuote.amountOut) {
                    results[multiHopDexId] = {
                        dexId: multiHopDexId,
                        quote: routing.bestRoute.quote,
                        isLoading: false,
                        isError: false,
                        error: null,
                        protocolType: routing.bestRoute.protocolType as
                            | ProtocolType.V2
                            | ProtocolType.V3,
                    }
                }
            }
        }
        return results
    }, [quotes, routing.bestRoute])
    const bestQuoteDex = useMemo(() => {
        const validQuotes = Object.values(quotesWithMultiHop).filter(
            (q) => q.quote && !q.isLoading && !q.isError
        )
        if (validQuotes.length === 0) return null

        const best = validQuotes.sort((a, b) => {
            if (!a.quote || !b.quote) return 0
            return Number(b.quote.amountOut - a.quote.amountOut)
        })[0]
        return best?.dexId ?? null
    }, [quotesWithMultiHop])
    const priceDifferences = useMemo(() => {
        const differences: Record<DEXType, number | null> = {}
        if (!bestQuoteDex) {
            Object.keys(quotesWithMultiHop).forEach((dexId) => {
                differences[dexId] = null
            })
            return differences
        }
        const bestQuote = quotesWithMultiHop[bestQuoteDex]?.quote
        if (!bestQuote) {
            Object.keys(quotesWithMultiHop).forEach((dexId) => {
                differences[dexId] = null
            })
            return differences
        }
        const bestAmountOut = bestQuote.amountOut
        Object.entries(quotesWithMultiHop).forEach(([dexId, dexQuote]) => {
            if (dexQuote.quote && !dexQuote.isLoading && !dexQuote.isError) {
                if (dexId === bestQuoteDex) {
                    differences[dexId] = 0
                } else {
                    const currentAmountOut = dexQuote.quote.amountOut
                    const percentageDiff =
                        (Number(currentAmountOut - bestAmountOut) / Number(bestAmountOut)) * 100
                    differences[dexId] = percentageDiff
                }
            } else {
                differences[dexId] = null
            }
        })
        return differences
    }, [quotesWithMultiHop, bestQuoteDex])
    const isAnyLoading = Object.values(quotesWithMultiHop).some((q) => q.isLoading)
    const hasAnyQuote = Object.values(quotesWithMultiHop).some((q) => q.quote !== null)
    return {
        dexQuotes: quotesWithMultiHop,
        bestQuoteDex,
        isAnyLoading: isAnyLoading || routing.isLoading,
        hasAnyQuote,
        priceDifferences,
        bestRoute: routing.bestRoute,
        isMultiHop: routing.bestRoute?.route.isMultiHop ?? false,
        allRoutes: routing.allRoutes,
    }
}
