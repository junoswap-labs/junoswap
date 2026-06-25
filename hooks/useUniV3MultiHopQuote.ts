'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import type { RouteQuote, SwapRoute } from '@/types/routing'
import type { DEXType } from '@/types/dex'
import { getV3Config, FEE_TIERS, getDexsByProtocol, ProtocolType } from '@/lib/dex-config'
import { getIntermediaryTokens } from '@/lib/routing-config'
import { UNISWAP_V3_QUOTER_V2_ABI } from '@/lib/abis/uniswap-v3-quoter'
import { encodeV3Path } from '@/services/dex/uniswap-v3'
import { getSwapAddress, getWrapOperation } from '@/services/tokens'
import { findTokenByAddress } from '@/lib/tokens'

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

const FEE_TIER_COMBINATIONS: [number, number][] = [
    [FEE_TIERS.MEDIUM, FEE_TIERS.MEDIUM], // 0.3% + 0.3%
    [FEE_TIERS.LOW, FEE_TIERS.MEDIUM], // 0.05% + 0.3%
    [FEE_TIERS.MEDIUM, FEE_TIERS.LOW], // 0.3% + 0.05%
    [FEE_TIERS.LOW, FEE_TIERS.LOW], // 0.05% + 0.05%
    [FEE_TIERS.STABLE, FEE_TIERS.MEDIUM], // 0.01% + 0.3%
    [FEE_TIERS.STABLE, FEE_TIERS.LOW], // 0.01% + 0.05%
    [FEE_TIERS.STABLE, FEE_TIERS.HIGH], // 0.01% + 1%
    [FEE_TIERS.MEDIUM, FEE_TIERS.STABLE], // 0.3% + 0.01%
    [FEE_TIERS.LOW, FEE_TIERS.STABLE], // 0.05% + 0.01%
    [FEE_TIERS.HIGH, FEE_TIERS.MEDIUM], // 1% + 0.3%
    [FEE_TIERS.HIGH, FEE_TIERS.LOW], // 1% + 0.05%
    [FEE_TIERS.MEDIUM, FEE_TIERS.HIGH], // 0.3% + 1%
    [FEE_TIERS.LOW, FEE_TIERS.HIGH], // 0.05% + 1%
    [FEE_TIERS.HIGH, FEE_TIERS.HIGH], // 1% + 1%
    [FEE_TIERS.STABLE, FEE_TIERS.STABLE], // 0.01% + 0.01%
]

interface RouteQuery {
    intermediary: Address
    fees: [number, number]
    tokens: [Address, Address, Address]
}

export function useUniV3MultiHopQuote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV3MultiHopQuoteParams): UseUniV3MultiHopQuoteResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const intermediaries = useMemo(() => {
        return getIntermediaryTokens(chainId)
    }, [chainId])
    const validIntermediaries = useMemo(() => {
        if (!tokenIn || !tokenOut) return []
        const tokenInAddr = tokenIn.address.toLowerCase()
        const tokenOutAddr = tokenOut.address.toLowerCase()

        return intermediaries.filter((addr) => {
            const lower = addr.toLowerCase()
            return lower !== tokenInAddr && lower !== tokenOutAddr
        })
    }, [tokenIn, tokenOut, intermediaries])
    const targetDexId = useMemo(() => {
        if (dexId) return dexId
        const v3Dexs = getDexsByProtocol(chainId, ProtocolType.V3)
        return v3Dexs[0] ?? 'junoswap'
    }, [dexId, chainId])
    const dexConfig = getV3Config(chainId, targetDexId)
    const wrapOperation = useMemo(() => getWrapOperation(tokenIn, tokenOut), [tokenIn, tokenOut])
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
        const queries: RouteQuery[] = []
        for (const intermediary of validIntermediaries) {
            for (const fees of FEE_TIER_COMBINATIONS) {
                queries.push({
                    intermediary,
                    fees,
                    tokens: [
                        getSwapAddress(tokenIn.address as Address, chainId),
                        getSwapAddress(intermediary, chainId),
                        getSwapAddress(tokenOut.address as Address, chainId),
                    ],
                })
            }
        }
        return queries
    }, [isReadyForQuote, tokenIn, tokenOut, validIntermediaries, chainId])
    const {
        data: quoteResults,
        isLoading,
        isError,
        error,
    } = useReadContracts({
        contracts: routeQueries.map((route) => ({
            address: dexConfig?.quoter,
            abi: UNISWAP_V3_QUOTER_V2_ABI,
            functionName: 'quoteExactInput' as const,
            args: [encodeV3Path(route.tokens, route.fees), amountIn],
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
                const [amountOut, , , gasEstimate] = result.result as [
                    bigint,
                    bigint[],
                    number[],
                    bigint,
                ]
                if (!amountOut || amountOut === 0n) return
                const intermediaryToken = findTokenByAddress(chainId, routeQuery.intermediary)
                const swapRoute: SwapRoute = {
                    path: routeQuery.tokens,
                    fees: routeQuery.fees,
                    isMultiHop: true,
                    intermediaryTokens: intermediaryToken ? [intermediaryToken] : [],
                }
                validRoutes.push({
                    route: swapRoute,
                    quote: {
                        amountOut,
                        sqrtPriceX96After: 0n,
                        initializedTicksCrossed: 0,
                        gasEstimate,
                    },
                    dexId: targetDexId,
                    protocolType: ProtocolType.V3,
                })
            }
        })
        const sorted = validRoutes.sort((a, b) => Number(b.quote.amountOut - a.quote.amountOut))
        return sorted
    }, [quoteResults, routeQueries, tokenIn, tokenOut, chainId, targetDexId])
    const bestRoute = routes[0] ?? null
    return {
        routes,
        bestRoute,
        isLoading,
        isError,
        error: error as Error | null,
    }
}
