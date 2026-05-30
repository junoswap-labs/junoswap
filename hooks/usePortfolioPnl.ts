'use client'

import { useMemo } from 'react'
import { useSwapAggregation } from '@/hooks/use-swap-aggregation'
import type { UserSwapEvent } from '@/hooks/useUserSwapEvents'
import type { TokenHolding } from '@/hooks/use-multi-balances'

interface PnlData {
    costBasisUsd: number
    unrealizedPnl: number
    pnlPercent: number
}

export function usePortfolioPnl(
    swapEvents: UserSwapEvent[] | undefined,
    holdings: Map<string, TokenHolding>,
    prices: Map<string, number | null>,
    nativeUsdPrice: number | null
) {
    // Convert holdings to the flat numeric map useSwapAggregation expects
    const holderMap = useMemo(() => {
        const map = new Map<string, Map<string, number>>()
        const tokenMap = new Map<string, number>()
        for (const [key, holding] of holdings) {
            const balance = Number(holding.formattedBalance)
            if (balance > 0) tokenMap.set(key, balance)
        }
        // Single address, use placeholder key
        if (tokenMap.size > 0) {
            map.set('self', tokenMap)
        }
        return map
    }, [holdings])

    // Convert UserSwapEvent[] to SwapEventInput[]
    const swapInputs = useMemo(
        () =>
            swapEvents?.map((e) => ({
                tokenAddr: e.tokenAddr,
                sender: 'self',
                isBuy: e.isBuy,
                amountIn: e.amountIn,
                amountOut: e.amountOut,
            })),
        [swapEvents]
    )

    const { perTokenPnl } = useSwapAggregation(swapInputs, holderMap, prices, nativeUsdPrice)

    return useMemo(() => {
        const pnlMap = new Map<string, PnlData | null>()
        for (const key of holdings.keys()) {
            pnlMap.set(key, perTokenPnl.get(key) ?? null)
        }
        return pnlMap
    }, [holdings, perTokenPnl])
}
