'use client'

import { useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { zeroAddress, type Address } from 'viem'
import {
    getV2Quotes,
    getSupportedDexs,
    getDexConfig,
    ProtocolType,
    type V2QuoteOutcome,
} from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { DEXType } from '@/lib/dex-meta'
import type { QuoteResult } from '@/types/swap'
import { isSameToken, getWrapOperation, wrapQuoteResult } from '@/lib/tokens'

interface UseUniV2QuoteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    dexId?: DEXType | DEXType[]
}

interface DexQuoteResult {
    quote: QuoteResult | null
    isLoading: boolean
    isError: boolean
    error: Error | null
    priceImpact?: number
}

interface UseUniV2QuoteResult {
    quotes: Record<DEXType, DexQuoteResult>
    isLoading: boolean
    primaryDexId: DEXType | null
}

export function useUniV2Quote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV2QuoteParams): UseUniV2QuoteResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const client = usePublicClient({ chainId })

    const requestedDexIds = useMemo(() => {
        if (!tokenIn) return []
        const ids =
            dexId === undefined ? getSupportedDexs(chainId, ProtocolType.V2) : [dexId].flat()
        return ids.filter((id) => !!getDexConfig(chainId, id, ProtocolType.V2))
    }, [dexId, tokenIn, chainId])
    const primaryDexId = requestedDexIds[0] ?? null

    const wrapOperation = useMemo(() => getWrapOperation(tokenIn, tokenOut), [tokenIn, tokenOut])

    const tokenInAddress = tokenIn ? (tokenIn.address as Address) : zeroAddress
    const tokenOutAddress = tokenOut ? (tokenOut.address as Address) : zeroAddress

    const isReadyForQuote =
        enabled &&
        !!client &&
        !!tokenIn &&
        !!tokenOut &&
        amountIn > 0n &&
        requestedDexIds.length > 0 &&
        tokenIn.chainId === tokenOut.chainId &&
        !isSameToken(tokenIn, tokenOut) &&
        !wrapOperation

    const quoteQuery = useQuery({
        queryKey: [
            'v2-quotes',
            chainId,
            dexId ?? 'all',
            tokenInAddress,
            tokenOutAddress,
            amountIn.toString(),
        ],
        queryFn: () =>
            getV2Quotes(client!, {
                chainId,
                dexId,
                tokenIn: tokenInAddress,
                tokenOut: tokenOutAddress,
                amountIn,
            }),
        enabled: isReadyForQuote,
        staleTime: 0,
    })

    const quotes: Record<DEXType, DexQuoteResult> = useMemo(() => {
        const results: Record<DEXType, DexQuoteResult> = {}

        if (wrapOperation && amountIn > 0n) {
            const wrapQuote = wrapQuoteResult(amountIn, wrapOperation)
            for (const id of requestedDexIds) {
                results[id] = { quote: wrapQuote, isLoading: false, isError: false, error: null }
            }
            return results
        }

        const data = quoteQuery.data?.direct

        for (const id of requestedDexIds) {
            const outcome: V2QuoteOutcome | undefined = data?.get(id)

            if (!outcome) {
                results[id] = {
                    quote: null,
                    isLoading: quoteQuery.isLoading,
                    isError: quoteQuery.isSuccess,
                    error: quoteQuery.isSuccess
                        ? new Error(`No pair found for ${tokenIn?.symbol}/${tokenOut?.symbol}`)
                        : (quoteQuery.error as Error | null),
                }
                continue
            }

            if (outcome.error) {
                results[id] = { quote: null, isLoading: false, isError: true, error: outcome.error }
            } else {
                results[id] = {
                    quote: outcome.quote,
                    isLoading: false,
                    isError: false,
                    error: null,
                    priceImpact: outcome.priceImpact,
                }
            }
        }
        return results
    }, [
        wrapOperation,
        amountIn,
        requestedDexIds,
        quoteQuery.data,
        quoteQuery.isLoading,
        quoteQuery.isSuccess,
        quoteQuery.error,
        tokenIn?.symbol,
        tokenOut?.symbol,
    ])

    const isLoading = wrapOperation ? false : isReadyForQuote && quoteQuery.isLoading

    return {
        quotes,
        isLoading,
        primaryDexId,
    }
}
