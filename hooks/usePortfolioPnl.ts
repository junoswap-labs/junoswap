'use client'

import { useMemo } from 'react'
import { formatEther } from 'viem'
import type { UserSwapEvent } from '@/hooks/useUserSwapEvents'
import type { TokenHolding } from '@/hooks/usePortfolioBalances'

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
    return useMemo(() => {
        const pnlMap = new Map<string, PnlData | null>()

        if (!swapEvents || !nativeUsdPrice) {
            for (const key of holdings.keys()) {
                pnlMap.set(key, null)
            }
            return pnlMap
        }

        const buysByToken = new Map<
            string,
            { totalNativePaid: number; totalTokensBought: number }
        >()
        for (const event of swapEvents) {
            if (!event.isBuy) continue
            const key = event.tokenAddr.toLowerCase()
            const acc = buysByToken.get(key) ?? { totalNativePaid: 0, totalTokensBought: 0 }
            acc.totalNativePaid += parseFloat(formatEther(BigInt(event.amountIn)))
            acc.totalTokensBought += parseFloat(formatEther(BigInt(event.amountOut)))
            buysByToken.set(key, acc)
        }

        for (const [key, holding] of holdings) {
            const buys = buysByToken.get(key)
            const priceUsd = prices.get(key)

            if (!buys || buys.totalTokensBought <= 0 || !priceUsd || priceUsd === 0) {
                pnlMap.set(key, null)
                continue
            }

            const entryPriceNative = buys.totalNativePaid / buys.totalTokensBought
            const currentBalance = parseFloat(formatEther(holding.rawBalance))
            const costBasisUsd = entryPriceNative * currentBalance * nativeUsdPrice
            const currentValueUsd = priceUsd * currentBalance
            const unrealizedPnl = currentValueUsd - costBasisUsd
            const pnlPercent =
                costBasisUsd > 0 ? ((currentValueUsd - costBasisUsd) / costBasisUsd) * 100 : 0

            pnlMap.set(key, { costBasisUsd, unrealizedPnl, pnlPercent })
        }

        for (const key of holdings.keys()) {
            if (!pnlMap.has(key)) {
                pnlMap.set(key, null)
            }
        }

        return pnlMap
    }, [swapEvents, holdings, prices, nativeUsdPrice])
}
