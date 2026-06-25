'use client'

import { useMemo } from 'react'
import {
    computePortfolioPnl,
    type TokenPnl,
    type PortfolioPnlTotals,
} from '@/services/dex/portfolio-pnl'
import type { UserSwapEvent } from '@/hooks/useUserSwapEvents'
import type { TokenHolding } from '@/hooks/use-multi-balances'

const EMPTY_TOTALS: PortfolioPnlTotals = {
    totalInvestedUsd: 0,
    realizedUsd: 0,
    unrealizedUsd: 0,
    totalPnlUsd: 0,
    totalPnlPercent: 0,
}

/**
 * Weighted-average, realized + unrealized PnL for the portfolio, denominated in
 * historical USD. `pnlByToken` is keyed by held-token address (for the cards);
 * `totals` aggregates every token with swap history, including fully-exited
 * positions whose realized gains no longer appear as holdings.
 */
export function usePortfolioPnl(
    swapEvents: UserSwapEvent[] | undefined,
    holdings: Map<string, TokenHolding>,
    prices: Map<string, number | null>,
    priceAt: (timestamp: number) => number
) {
    const balanceByToken = useMemo(() => {
        const map = new Map<string, number>()
        for (const [key, holding] of holdings) {
            const balance = Number(holding.formattedBalance)
            if (balance > 0) map.set(key, balance)
        }
        return map
    }, [holdings])

    // Token decimals so the PnL engine decodes swap amounts at the right scale;
    // without this, 6-decimal tokens (e.g. USDT) get astronomical cost bases.
    const decimalsByToken = useMemo(() => {
        const map = new Map<string, number>()
        for (const [key, holding] of holdings) {
            map.set(key, holding.token.decimals)
        }
        return map
    }, [holdings])

    return useMemo(() => {
        if (!swapEvents || swapEvents.length === 0) {
            return { pnlByToken: new Map<string, TokenPnl | null>(), totals: EMPTY_TOTALS }
        }

        const { perToken, totals } = computePortfolioPnl(
            swapEvents,
            balanceByToken,
            prices,
            priceAt,
            decimalsByToken
        )

        // Expose only held tokens to the cards; null for tokens without history.
        const pnlByToken = new Map<string, TokenPnl | null>()
        for (const key of holdings.keys()) {
            pnlByToken.set(key, perToken.get(key) ?? null)
        }

        return { pnlByToken, totals }
    }, [swapEvents, balanceByToken, decimalsByToken, prices, priceAt, holdings])
}
