'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import type { RouteQuote, SwapRoute } from '@/types/routing'
import type { DEXType } from '@/types/dex'
import { getV2Config, getDexsByProtocol, ProtocolType } from '@/lib/dex-config'
import { getIntermediaryTokens } from '@/lib/routing-config'
import { UNISWAP_V2_ROUTER_ABI } from '@/lib/abis/uniswap-v2-router'
import { buildMultiHopSwapPath } from '@/services/dex/uniswap-v2'
import { getWrapOperation } from '@/services/tokens'
import { findTokenByAddress } from '@/lib/tokens'

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

interface RouteQuery {
    intermediary: Address
    path: Address[]
}

export function useUniV2MultiHopQuote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV2MultiHopQuoteParams): UseUniV2MultiHopQuoteResult {
    const chainId = tokenIn?.chainId ?? 1
    const intermediaries = useMemo(() => getIntermediaryTokens(chainId), [chainId])
    const targetDexId = useMemo(() => {
        if (dexId) return dexId
        const v2Dexs = getDexsByProtocol(chainId, ProtocolType.V2)
        return v2Dexs[0] ?? 'jibswap'
    }, [dexId, chainId])

    const dexConfig = getV2Config(chainId, targetDexId)
    const wrapOperation = useMemo(() => getWrapOperation(tokenIn, tokenOut), [tokenIn, tokenOut])
    const validIntermediaries = useMemo(() => {
        if (!tokenIn || !tokenOut) return []
        const tokenInAddr = tokenIn.address.toLowerCase()
        const tokenOutAddr = tokenOut.address.toLowerCase()
        return intermediaries.filter((addr) => {
            const lower = addr.toLowerCase()
            return lower !== tokenInAddr && lower !== tokenOutAddr
        })
    }, [tokenIn, tokenOut, intermediaries])
    const isReadyForQuote =
        enabled &&
        !!tokenIn &&
        !!tokenOut &&
        amountIn > 0n &&
        !!dexConfig &&
        !wrapOperation &&
        validIntermediaries.length > 0
    const routeQueries = useMemo((): RouteQuery[] => {
        if (!isReadyForQuote || !tokenIn || !tokenOut) return []
        return validIntermediaries.map((intermediary) => ({
            intermediary,
            path: buildMultiHopSwapPath(
                [tokenIn.address as Address, intermediary, tokenOut.address as Address],
                chainId,
                dexConfig?.wnative
            ),
        }))
    }, [isReadyForQuote, tokenIn, tokenOut, validIntermediaries, chainId, dexConfig])
    const {
        data: quoteResults,
        isLoading,
        isError,
        error,
    } = useReadContracts({
        contracts: routeQueries.map((route) => ({
            address: dexConfig?.router,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: 'getAmountsOut' as const,
            args: [amountIn, route.path],
            chainId,
        })),
        query: {
            enabled: isReadyForQuote && routeQueries.length > 0,
            staleTime: 10_000,
        },
    })
    const routes = useMemo(() => {
        if (!quoteResults || !tokenIn || !tokenOut) return []
        const validRoutes: RouteQuote[] = []
        quoteResults.forEach((result, index) => {
            if (result.status === 'success' && result.result) {
                const routeQuery = routeQueries[index]
                if (!routeQuery) return
                const amounts = result.result as bigint[]
                const amountOut = amounts[amounts.length - 1]
                if (!amountOut || amountOut === 0n) return
                const intermediaryToken = findTokenByAddress(chainId, routeQuery.intermediary)
                const swapRoute: SwapRoute = {
                    path: routeQuery.path,
                    isMultiHop: true,
                    intermediaryTokens: intermediaryToken ? [intermediaryToken] : [],
                }
                validRoutes.push({
                    route: swapRoute,
                    quote: {
                        amountOut,
                        sqrtPriceX96After: 0n,
                        initializedTicksCrossed: 0,
                        gasEstimate: 200000n, // Estimated gas for V2 multi-hop
                    },
                    dexId: targetDexId,
                    protocolType: ProtocolType.V2,
                })
            }
        })
        const sorted = validRoutes.sort((a, b) => Number(b.quote.amountOut - a.quote.amountOut))
        return sorted
    }, [quoteResults, routeQueries, tokenIn, tokenOut, chainId, targetDexId])
    return {
        routes,
        bestRoute: routes[0] ?? null,
        isLoading,
        isError,
        error: error as Error | null,
    }
}
