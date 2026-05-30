'use client'

import { useMemo } from 'react'
import { formatEther } from 'viem'

export interface SwapEventInput {
    tokenAddr: string
    sender: string
    isBuy: boolean | number
    amountIn: string
    amountOut: string
}

export interface TokenPnl {
    costBasisUsd: number
    unrealizedPnl: number
    pnlPercent: number
}

export interface AddressStats {
    volumeNative: number
    tradeCount: number
    buyCount: number
    sellCount: number
    pnlNative: number
    pnlPercent: number
}

export function useSwapAggregation(
    swapEvents: SwapEventInput[] | undefined,
    holderMap: Map<string, Map<string, number>>,
    priceMap: Map<string, number | null>,
    nativeUsdPrice: number | null
) {
    return useMemo(() => {
        const perTokenPnl = new Map<string, TokenPnl | null>()
        const perAddressStats = new Map<string, AddressStats>()

        if (!swapEvents || swapEvents.length === 0) {
            return { perTokenPnl, perAddressStats }
        }

        // Aggregate per-address volume/stats
        const statsByAddress = new Map<
            string,
            {
                volumeNative: number
                tradeCount: number
                buyCount: number
                sellCount: number
                buysByToken: Map<string, { totalNativePaid: number; totalTokensBought: number }>
            }
        >()

        for (const event of swapEvents) {
            const sender = event.sender.toLowerCase()
            const isBuy = typeof event.isBuy === 'number' ? event.isBuy === 1 : event.isBuy
            const nativeAmount = parseFloat(
                formatEther(BigInt(isBuy ? event.amountIn : event.amountOut))
            )

            let stats = statsByAddress.get(sender)
            if (!stats) {
                stats = {
                    volumeNative: 0,
                    tradeCount: 0,
                    buyCount: 0,
                    sellCount: 0,
                    buysByToken: new Map(),
                }
                statsByAddress.set(sender, stats)
            }

            stats.volumeNative += nativeAmount
            stats.tradeCount++

            if (isBuy) {
                stats.buyCount++
                const tokenKey = event.tokenAddr.toLowerCase()
                const acc = stats.buysByToken.get(tokenKey) ?? {
                    totalNativePaid: 0,
                    totalTokensBought: 0,
                }
                acc.totalNativePaid += parseFloat(formatEther(BigInt(event.amountIn)))
                acc.totalTokensBought += parseFloat(formatEther(BigInt(event.amountOut)))
                stats.buysByToken.set(tokenKey, acc)
            } else {
                stats.sellCount++
            }
        }

        // Compute per-address PNL and stats
        for (const [address, stats] of statsByAddress) {
            let totalCostBasisNative = 0
            let totalCurrentValueNative = 0

            for (const [tokenAddr, buyAcc] of stats.buysByToken) {
                if (buyAcc.totalTokensBought <= 0) continue
                const avgPrice = buyAcc.totalNativePaid / buyAcc.totalTokensBought
                const price = priceMap.get(tokenAddr)
                const priceNative =
                    price !== null && price !== undefined && nativeUsdPrice
                        ? price / nativeUsdPrice
                        : 0
                const tokens = holderMap.get(address)
                const currentBalance = tokens?.get(tokenAddr) ?? 0
                totalCostBasisNative += avgPrice * currentBalance
                totalCurrentValueNative += priceNative * currentBalance
            }

            const pnlNative = totalCurrentValueNative - totalCostBasisNative
            const pnlPercent =
                totalCostBasisNative > 0 ? (pnlNative / totalCostBasisNative) * 100 : 0

            perAddressStats.set(address, {
                volumeNative: stats.volumeNative,
                tradeCount: stats.tradeCount,
                buyCount: stats.buyCount,
                sellCount: stats.sellCount,
                pnlNative,
                pnlPercent,
            })
        }

        // Compute per-token PNL for a single-user view (portfolio)
        // Aggregate all buys across all senders per token
        if (swapEvents.length > 0 && nativeUsdPrice) {
            // For single-user: all events are from one sender
            const allBuysByToken = new Map<
                string,
                { totalNativePaid: number; totalTokensBought: number }
            >()
            for (const event of swapEvents) {
                const isBuy = typeof event.isBuy === 'number' ? event.isBuy === 1 : event.isBuy
                if (!isBuy) continue
                const key = event.tokenAddr.toLowerCase()
                const acc = allBuysByToken.get(key) ?? { totalNativePaid: 0, totalTokensBought: 0 }
                acc.totalNativePaid += parseFloat(formatEther(BigInt(event.amountIn)))
                acc.totalTokensBought += parseFloat(formatEther(BigInt(event.amountOut)))
                allBuysByToken.set(key, acc)
            }

            for (const [tokenAddr, buyAcc] of allBuysByToken) {
                if (buyAcc.totalTokensBought <= 0) {
                    perTokenPnl.set(tokenAddr, null)
                    continue
                }
                const entryPriceNative = buyAcc.totalNativePaid / buyAcc.totalTokensBought
                // For portfolio: need rawBalance, derive from holderMap single address
                const priceUsd = priceMap.get(tokenAddr)
                if (!priceUsd || priceUsd === 0) {
                    perTokenPnl.set(tokenAddr, null)
                    continue
                }
                // Get balance from first (only) address in holderMap
                const firstEntry = holderMap.values().next().value
                const currentBalance = firstEntry?.get(tokenAddr) ?? 0
                const costBasisUsd = entryPriceNative * currentBalance * nativeUsdPrice
                const currentValueUsd = priceUsd * currentBalance
                const unrealizedPnl = currentValueUsd - costBasisUsd
                const pnlPercent =
                    costBasisUsd > 0 ? ((currentValueUsd - costBasisUsd) / costBasisUsd) * 100 : 0
                perTokenPnl.set(tokenAddr, { costBasisUsd, unrealizedPnl, pnlPercent })
            }
        }

        return { perTokenPnl, perAddressStats }
    }, [swapEvents, holderMap, priceMap, nativeUsdPrice])
}
