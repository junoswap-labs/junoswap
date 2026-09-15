'use client'

import { useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { zeroAddress, type Address } from 'viem'
import { getV3Quotes } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { DEXType } from '@/lib/dex-meta'
import type { RouteQuote, SwapRoute } from '@/types/routing'
import { getIntermediaryTokens, MAX_HOPS } from '@/lib/routing-config'
import { getSwapAddress, getWrapOperation, findTokenByAddress } from '@/lib/tokens'

interface UseUniV3MultiHopQuoteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    dexId?: DEXType
}

interface UseUniV3MultiHopQuoteResult {
    routes: RouteQuote[]
    bestRoute: RouteQuote | null
    isLoading: boolean
    isError: boolean
    error: Error | null
}

export function useUniV3MultiHopQuote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV3MultiHopQuoteParams): UseUniV3MultiHopQuoteResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const client = usePublicClient({ chainId })

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
        !wrapOperation

    const quoteQuery = useQuery({
        queryKey: [
            'v3-multihop-quotes',
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
                fees: r.fees,
                isMultiHop: true,
                intermediaryTokens,
            }
            return [
                {
                    route,
                    quote: r.quote,
                    dexId: r.dexId,
                    protocolType: 'v3',
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
