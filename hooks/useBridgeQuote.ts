'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { parseUnits } from 'viem'
import { formatDisplayAmount } from '@/services/tokens'
import type { Route } from '@lifi/types'
import { useBridgeStore } from '@/store/bridge-store'
import { useDebounce } from '@/hooks/useDebounce'
import { fetchBridgeRoutes } from '@/services/bridge/lifi'

interface UseBridgeQuoteResult {
    /** Best route from LI.FI */
    route: Route | null
    /** All available routes (for future route comparison UI) */
    routes: Route[]
    /** Estimated output amount (formatted string) */
    estimatedOutput: string
    /** Whether the quote is loading */
    isLoading: boolean
    /** Error message if quote failed */
    error: string | null
    /** Gas cost in USD */
    gasCostUSD: string | null
    /** Fee costs breakdown */
    feeCosts: { name: string; percentage: string; amountUSD: string }[]
    /** Estimated execution duration in seconds */
    estimatedDuration: number | null
    /** Manually refetch the quote */
    refetch: () => void
}

export function useBridgeQuote(): UseBridgeQuoteResult {
    const { address } = useAccount()
    const {
        fromChainId,
        toChainId,
        fromToken,
        toToken,
        amountIn,
        settings,
        setIsLoading,
        setError,
        setQuote,
    } = useBridgeStore()

    const debouncedAmountIn = useDebounce(amountIn, 500)

    const [routes, setRoutes] = useState<Route[]>([])
    const [isLoadingQuote, setIsLoadingQuote] = useState(false)
    const [quoteError, setQuoteError] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    const fetchQuote = useCallback(async () => {
        // Validate all required params
        if (
            !address ||
            !fromToken ||
            !toToken ||
            !debouncedAmountIn ||
            parseFloat(debouncedAmountIn) <= 0 ||
            fromChainId === toChainId
        ) {
            setRoutes([])
            setQuoteError(null)
            setIsLoadingQuote(false)
            setIsLoading(false)
            return
        }

        // Cancel previous request
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setIsLoadingQuote(true)
        setIsLoading(true)
        setQuoteError(null)

        try {
            const fromAmount = parseUnits(debouncedAmountIn, fromToken.decimals).toString()

            const result = await fetchBridgeRoutes({
                fromChainId,
                toChainId,
                fromTokenAddress: fromToken.address,
                toTokenAddress: toToken.address,
                fromAmount,
                fromAddress: address,
                slippage: settings.slippage,
            })

            // Check if request was aborted
            if (controller.signal.aborted) return

            setRoutes(result)

            if (result.length > 0 && result[0]) {
                setQuote(result[0])
            } else {
                setQuote(null)
                setQuoteError('No routes available for this pair')
            }
        } catch (err) {
            if (controller.signal.aborted) return
            const message = err instanceof Error ? err.message : 'Failed to fetch bridge quote'
            setQuoteError(message)
            setError(message)
            setRoutes([])
            setQuote(null)
        } finally {
            if (!controller.signal.aborted) {
                setIsLoadingQuote(false)
                setIsLoading(false)
            }
        }
    }, [
        address,
        fromToken,
        toToken,
        debouncedAmountIn,
        fromChainId,
        toChainId,
        settings.slippage,
        setIsLoading,
        setError,
        setQuote,
    ])

    useEffect(() => {
        fetchQuote()
        return () => {
            abortRef.current?.abort()
        }
    }, [fetchQuote])

    const bestRoute = routes[0] ?? null

    // Extract estimated output
    const estimatedOutput =
        bestRoute && toToken
            ? (() => {
                  try {
                      return formatDisplayAmount(BigInt(bestRoute.toAmount), toToken.decimals)
                  } catch {
                      return '0'
                  }
              })()
            : '0'

    // Extract gas cost
    const gasCostUSD = bestRoute?.gasCostUSD ?? null

    // Extract fee costs from the first step
    const feeCosts: UseBridgeQuoteResult['feeCosts'] = []
    if (bestRoute?.steps[0]?.estimate?.feeCosts) {
        for (const fee of bestRoute.steps[0].estimate.feeCosts) {
            feeCosts.push({
                name: fee.name,
                percentage: fee.percentage,
                amountUSD: fee.amountUSD,
            })
        }
    }

    // Extract estimated duration (sum of all steps)
    const estimatedDuration =
        bestRoute?.steps.reduce((sum, step) => sum + (step.estimate?.executionDuration ?? 0), 0) ??
        null

    return {
        route: bestRoute,
        routes,
        estimatedOutput,
        isLoading: isLoadingQuote,
        error: quoteError,
        gasCostUSD,
        feeCosts,
        estimatedDuration,
        refetch: fetchQuote,
    }
}
