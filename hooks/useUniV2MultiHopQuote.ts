'use client'

import { useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { zeroAddress, type Address } from 'viem'
import { getV2Quotes } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { DEXType } from '@/lib/dex-meta'
import type { RouteQuote, SwapRoute } from '@/types/routing'
import { getIntermediaryTokens, MAX_HOPS } from '@/lib/routing-config'
import { getWrapOperation, findTokenByAddress } from '@/lib/tokens'

interface UseUniV2MultiHopQuoteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    dexId?: DEXType
}

interface UseUniV2MultiHopQuoteResult {
    routes: RouteQuote[]
    bestRoute: RouteQuote | null
    isLoading: boolean
    isError: boolean
    error: Error | null
}

export function useUniV2MultiHopQuote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV2MultiHopQuoteParams): UseUniV2MultiHopQuoteResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const client = usePublicClient({ chainId })

    const wrapOperation = useMemo(() => getWrapOperation(tokenIn, tokenOut), [tokenIn, tokenOut])

    const tokenInAddress = tokenIn ? (tokenIn.address as Address) : zeroAddress
    const tokenOutAddress = tokenOut ? (tokenOut.address as Address) : zeroAddress

    const isReadyForQuote =
        enabled && !!client && !!tokenIn && !!tokenOut && amountIn > 0n && !wrapOperation

    const quoteQuery = useQuery({
        queryKey: [
            'v2-multihop-quotes',
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
                connectors: getIntermediaryTokens(chainId),
                maxHops: MAX_HOPS,
            }),
        enabled: isReadyForQuote,
        staleTime: 0,
    })

    const routes = useMemo((): RouteQuote[] => {
        const data = quoteQuery.data
        if (!data || data.length === 0) return []
        return data.flatMap((r) => {
            if (!r.quote || r.path.length <= 2) return []
            const intermediaryTokens = r.path
                .slice(1, -1)
                .map((addr) => findTokenByAddress(chainId, addr))
                .filter((t): t is Token => !!t)
            const route: SwapRoute = {
                path: r.path,
                isMultiHop: true,
                intermediaryTokens,
            }
            return [
                {
                    route,
                    quote: r.quote,
                    dexId: r.dexId,
                    protocolType: 'v2',
                },
            ]
        })
    }, [quoteQuery.data, chainId])

    return {
        routes,
        bestRoute: routes[0] ?? null,
        isLoading: isReadyForQuote && quoteQuery.isLoading,
        isError: quoteQuery.isError,
        error: quoteQuery.error as Error | null,
    }
}
