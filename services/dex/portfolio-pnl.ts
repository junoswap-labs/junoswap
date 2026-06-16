import { formatEther } from 'viem'

/**
 * One swap as seen by a single user. Semantics match the indexer output:
 * - buy:  amountIn = native paid, amountOut = tokens received
 * - sell: amountIn = tokens sold, amountOut = native received
 * `timestamp` is used to value the trade at the KUB/USD rate of its time.
 */
export interface PnlSwapEvent {
    tokenAddr: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
}

export interface TokenPnl {
    /** Cost basis (USD-at-trade-time) of the tokens still held. */
    costBasisUsd: number
    /** Total native (USD-at-trade-time) ever spent buying this token. */
    totalInvestedUsd: number
    /** Realized PnL from sells (proceeds − avg cost of sold), USD-at-trade-time. */
    realizedUsd: number
    /** Unrealized PnL on current holdings (current value − cost basis). */
    unrealizedUsd: number
    /** realizedUsd + unrealizedUsd. */
    totalPnlUsd: number
    /** totalPnlUsd / totalInvestedUsd × 100. */
    pnlPercent: number
}

export interface PortfolioPnlTotals {
    totalInvestedUsd: number
    realizedUsd: number
    unrealizedUsd: number
    totalPnlUsd: number
    totalPnlPercent: number
}

interface PortfolioPnlResult {
    /** Keyed by lowercased token address; covers every token with swap history. */
    perToken: Map<string, TokenPnl>
    totals: PortfolioPnlTotals
}

/**
 * Weighted-average-cost PnL, denominated in historical USD.
 *
 * For each token, events are replayed in chronological order maintaining a running
 * position and USD cost pool. Each buy adds to the pool at the trade-time KUB/USD
 * rate; each sell realizes (proceeds − avgCost × sold) and removes that cost from
 * the pool. Unrealized PnL on remaining holdings is valued against the *on-chain*
 * balance so transfers/airdrops don't corrupt the held basis.
 *
 * @param events            user swaps, ideally already sorted ascending by timestamp
 * @param balanceByToken    current on-chain balance per lowercased token address
 * @param priceUsdByToken   current USD price per lowercased token address
 * @param priceAt           KUB/USD rate at a given unix timestamp
 */
export function computePortfolioPnl(
    events: PnlSwapEvent[],
    balanceByToken: Map<string, number>,
    priceUsdByToken: Map<string, number | null>,
    priceAt: (timestamp: number) => number
): PortfolioPnlResult {
    // Group events by token, preserving chronological order.
    const eventsByToken = new Map<string, PnlSwapEvent[]>()
    for (const event of events) {
        const key = event.tokenAddr.toLowerCase()
        const list = eventsByToken.get(key)
        if (list) list.push(event)
        else eventsByToken.set(key, [event])
    }

    const perToken = new Map<string, TokenPnl>()
    const totals: PortfolioPnlTotals = {
        totalInvestedUsd: 0,
        realizedUsd: 0,
        unrealizedUsd: 0,
        totalPnlUsd: 0,
        totalPnlPercent: 0,
    }

    for (const [tokenAddr, tokenEvents] of eventsByToken) {
        const sorted = [...tokenEvents].sort((a, b) => a.timestamp - b.timestamp)

        let position = 0 // tokens held per accounting
        let costPoolUsd = 0 // USD-at-trade-time cost of the held position
        let realizedUsd = 0
        let totalInvestedUsd = 0

        for (const event of sorted) {
            const nativeUsd = priceAt(event.timestamp)
            if (event.isBuy) {
                const tokensIn = parseFloat(formatEther(BigInt(event.amountOut)))
                const nativePaid = parseFloat(formatEther(BigInt(event.amountIn)))
                const usdPaid = nativePaid * nativeUsd
                position += tokensIn
                costPoolUsd += usdPaid
                totalInvestedUsd += usdPaid
            } else {
                const tokensOut = parseFloat(formatEther(BigInt(event.amountIn)))
                const nativeRecv = parseFloat(formatEther(BigInt(event.amountOut)))
                const usdRecv = nativeRecv * nativeUsd
                const avgCost = position > 0 ? costPoolUsd / position : 0
                const soldFromPosition = Math.min(tokensOut, position)
                const costOfSold = avgCost * soldFromPosition
                realizedUsd += usdRecv - costOfSold
                costPoolUsd -= costOfSold
                position = Math.max(0, position - tokensOut)
            }
        }

        const currentBalance = balanceByToken.get(tokenAddr) ?? 0
        const currentPrice = priceUsdByToken.get(tokenAddr) ?? null
        const avgCost = position > 0 ? costPoolUsd / position : 0
        const costBasisUsd = avgCost * currentBalance
        const currentValueUsd = currentPrice !== null ? currentPrice * currentBalance : 0
        const unrealizedUsd = currentPrice !== null ? currentValueUsd - costBasisUsd : 0
        const totalPnlUsd = realizedUsd + unrealizedUsd
        const pnlPercent = totalInvestedUsd > 0 ? (totalPnlUsd / totalInvestedUsd) * 100 : 0

        perToken.set(tokenAddr, {
            costBasisUsd,
            totalInvestedUsd,
            realizedUsd,
            unrealizedUsd,
            totalPnlUsd,
            pnlPercent,
        })

        totals.totalInvestedUsd += totalInvestedUsd
        totals.realizedUsd += realizedUsd
        totals.unrealizedUsd += unrealizedUsd
        totals.totalPnlUsd += totalPnlUsd
    }

    totals.totalPnlPercent =
        totals.totalInvestedUsd > 0 ? (totals.totalPnlUsd / totals.totalInvestedUsd) * 100 : 0

    return { perToken, totals }
}

/** A swap tagged with the trader it belongs to (lowercased downstream). */
export interface LeaderboardSwapEvent extends PnlSwapEvent {
    sender: string
}

interface AddressTraderStats {
    pnlUsd: number
    pnlPercent: number
    volumeNative: number
    tradeCount: number
    buyCount: number
    sellCount: number
}

/**
 * Per-trader stats for the leaderboard. PnL is computed by the exact same engine
 * as the portfolio (`computePortfolioPnl`), run once per address, so the math is
 * identical. Volume (native side of each swap) and trade counts are aggregated in
 * the same pass.
 *
 * @param events            swaps tagged with `sender`
 * @param balanceByAddress  current on-chain balances, keyed by lowercased address
 *                          then lowercased token address
 * @param priceUsdByToken   current USD price per lowercased token address
 * @param priceAt           KUB/USD rate at a given unix timestamp
 */
export function computeTraderStatsByAddress(
    events: LeaderboardSwapEvent[],
    balanceByAddress: Map<string, Map<string, number>>,
    priceUsdByToken: Map<string, number | null>,
    priceAt: (timestamp: number) => number
): Map<string, AddressTraderStats> {
    const eventsByAddress = new Map<string, LeaderboardSwapEvent[]>()
    for (const event of events) {
        const key = event.sender.toLowerCase()
        const list = eventsByAddress.get(key)
        if (list) list.push(event)
        else eventsByAddress.set(key, [event])
    }

    const statsByAddress = new Map<string, AddressTraderStats>()

    for (const [address, addrEvents] of eventsByAddress) {
        let volumeNative = 0
        let buyCount = 0
        let sellCount = 0
        for (const event of addrEvents) {
            // Native side of the swap: amountIn for buys, amountOut for sells.
            volumeNative += parseFloat(
                formatEther(BigInt(event.isBuy ? event.amountIn : event.amountOut))
            )
            if (event.isBuy) buyCount++
            else sellCount++
        }

        const { totals } = computePortfolioPnl(
            addrEvents,
            balanceByAddress.get(address) ?? new Map(),
            priceUsdByToken,
            priceAt
        )

        statsByAddress.set(address, {
            pnlUsd: totals.totalPnlUsd,
            pnlPercent: totals.totalPnlPercent,
            volumeNative,
            tradeCount: addrEvents.length,
            buyCount,
            sellCount,
        })
    }

    return statsByAddress
}
