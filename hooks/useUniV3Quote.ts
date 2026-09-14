'use client'

import { useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { zeroAddress, type Address } from 'viem'
import {
    getV3Quotes,
    getDexConfig,
    ProtocolType,
    type V3QuoteOutcome,
} from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { DEXType } from '@/lib/dex-meta'
import type { QuoteResult } from '@/types/swap'
import { isSameToken, getSwapAddress, getWrapOperation, wrapQuoteResult } from '@/lib/tokens'

interface UseUniV3QuoteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    dexId?: DEXType | DEXType[]
}

interface UseUniV3QuoteResult {
    quote: QuoteResult | null
    isLoading: boolean
    isError: boolean
    error: Error | null
    fee: number | null
    priceImpact: number | undefined
    primaryDexId: DEXType | null
}

export function useUniV3Quote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV3QuoteParams): UseUniV3QuoteResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const client = usePublicClient({ chainId })

    const pinnedDexId = useMemo(() => {
        const first = Array.isArray(dexId) ? (dexId[0] ?? null) : (dexId ?? null)
        return first && getDexConfig(chainId, first, ProtocolType.V3) ? first : null
    }, [dexId, chainId])

    const wrapOperation = useMemo(() => getWrapOperation(tokenIn, tokenOut), [tokenIn, tokenOut])

    const tokenInAddress = tokenIn
        ? getSwapAddress(tokenIn.address as Address, chainId)
        : zeroAddress
    const tokenOutAddress = tokenOut
        ? getSwapAddress(tokenOut.address as Address, chainId)
        : zeroAddress

    const isReadyForQuote =
        enabled &&
        !!client &&
        !!tokenIn &&
        !!tokenOut &&
        amountIn > 0n &&
        tokenIn.chainId === tokenOut.chainId &&
        !isSameToken(tokenIn, tokenOut) &&
        !wrapOperation

    const quoteQuery = useQuery({
        queryKey: [
            'v3-quotes',
            chainId,
            dexId ?? 'all',
            tokenInAddress,
            tokenOutAddress,
            amountIn.toString(),
        ],
        queryFn: () =>
            getV3Quotes(client!, {
                chainId,
                dexId,
                tokenIn: tokenInAddress,
                tokenOut: tokenOutAddress,
                amountIn,
            }),
        enabled: isReadyForQuote,
        staleTime: 0,
    })

    const outcome = useMemo(() => {
        const data = quoteQuery.data?.direct
        if (!data || data.size === 0) return null
        if (pinnedDexId) return data.get(pinnedDexId) ?? null
        let best: V3QuoteOutcome | null = null
        for (const o of data.values()) {
            if (!o.quote) continue
            if (!best?.quote || o.quote.amountOut > best.quote.amountOut) best = o
        }
        return best
    }, [quoteQuery.data, pinnedDexId])

    const quote: QuoteResult | null = useMemo(() => {
        if (wrapOperation && amountIn > 0n) return wrapQuoteResult(amountIn, wrapOperation)
        return outcome?.quote ?? null
    }, [wrapOperation, amountIn, outcome])

    const hasNoPool = !wrapOperation && quoteQuery.isSuccess && !outcome && !!tokenIn && !!tokenOut

    const quoteError = outcome?.error ?? (quoteQuery.error as Error | null)

    const error: Error | null = useMemo(() => {
        if (quoteError) return quoteError
        if (hasNoPool) return new Error(`No pool found for ${tokenIn!.symbol}/${tokenOut!.symbol}`)
        return null
    }, [quoteError, hasNoPool, tokenIn, tokenOut])

    return {
        quote,
        isLoading: wrapOperation ? false : quoteQuery.isLoading,
        isError: !!quoteError || hasNoPool,
        error,
        fee: outcome?.fee ?? null,
        priceImpact: outcome?.priceImpact,
        primaryDexId: pinnedDexId ?? outcome?.dexId ?? null,
    }
}
