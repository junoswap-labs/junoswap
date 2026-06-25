import { describe, it, expect } from 'vitest'
import { parseEther, parseUnits } from 'viem'
import {
    computePortfolioPnl,
    computeTraderStatsByAddress,
    type PnlSwapEvent,
    type LeaderboardSwapEvent,
} from '@/services/dex/portfolio-pnl'

const TOKEN = '0xtoken'

function buy(tokens: number, kub: number, timestamp: number): PnlSwapEvent {
    return {
        tokenAddr: TOKEN,
        isBuy: true,
        amountIn: parseEther(String(kub)).toString(), // native paid
        amountOut: parseEther(String(tokens)).toString(), // tokens received
        timestamp,
    }
}

function sell(tokens: number, kub: number, timestamp: number): PnlSwapEvent {
    return {
        tokenAddr: TOKEN,
        isBuy: false,
        amountIn: parseEther(String(tokens)).toString(), // tokens sold
        amountOut: parseEther(String(kub)).toString(), // native received
        timestamp,
    }
}

// Constant KUB/USD unless a scenario needs history.
const flatRate = (_t: number) => 2

describe('services/dex/portfolio-pnl', () => {
    it('buy-only: unrealized only, no realized', () => {
        const events = [buy(100, 10, 1)] // invested 10 KUB * $2 = $20, avg cost $0.2/token
        const balances = new Map([[TOKEN, 100]])
        const prices = new Map([[TOKEN, 0.5]]) // value = $50

        const { perToken, totals } = computePortfolioPnl(events, balances, prices, flatRate)
        const pnl = perToken.get(TOKEN)!

        expect(pnl.totalInvestedUsd).toBeCloseTo(20)
        expect(pnl.costBasisUsd).toBeCloseTo(20)
        expect(pnl.realizedUsd).toBeCloseTo(0)
        expect(pnl.unrealizedUsd).toBeCloseTo(30)
        expect(pnl.totalPnlUsd).toBeCloseTo(30)
        expect(pnl.pnlPercent).toBeCloseTo(150)
        expect(totals.totalPnlUsd).toBeCloseTo(30)
    })

    it('partial sell: realizes proceeds minus avg cost of sold', () => {
        const events = [buy(100, 10, 1), sell(50, 8, 2)]
        // invested $20, avg $0.2. Sell 50 for 8 KUB*$2=$16; costOfSold=$10 -> realized $6.
        // remaining position 50, costPool $10.
        const balances = new Map([[TOKEN, 50]])
        const prices = new Map([[TOKEN, 0.3]]) // value $15, basis $10 -> unrealized $5

        const { perToken } = computePortfolioPnl(events, balances, prices, flatRate)
        const pnl = perToken.get(TOKEN)!

        expect(pnl.realizedUsd).toBeCloseTo(6)
        expect(pnl.costBasisUsd).toBeCloseTo(10)
        expect(pnl.unrealizedUsd).toBeCloseTo(5)
        expect(pnl.totalPnlUsd).toBeCloseTo(11)
    })

    it('full exit: realized captured, contributes to totals despite zero balance', () => {
        const events = [buy(100, 10, 1), sell(100, 30, 2)]
        // invested $20; proceeds 30 KUB*$2=$60; costOfSold $20 -> realized $40.
        const balances = new Map<string, number>() // sold everything, not held
        const prices = new Map<string, number | null>()

        const { perToken, totals } = computePortfolioPnl(events, balances, prices, flatRate)
        const pnl = perToken.get(TOKEN)!

        expect(pnl.realizedUsd).toBeCloseTo(40)
        expect(pnl.unrealizedUsd).toBeCloseTo(0)
        expect(pnl.totalPnlUsd).toBeCloseTo(40)
        // The closed position still counts toward portfolio totals.
        expect(totals.totalPnlUsd).toBeCloseTo(40)
        expect(totals.realizedUsd).toBeCloseTo(40)
    })

    it('values each buy at its historical KUB/USD rate, not the current one', () => {
        // Two buys of 50 tokens for 10 KUB each, but KUB was $1 then $3.
        const events = [buy(50, 10, 1), buy(50, 10, 2)]
        const priceAt = (t: number) => (t <= 1 ? 1 : 3)
        const balances = new Map([[TOKEN, 100]])
        const prices = new Map([[TOKEN, 0.5]]) // value $50

        const { perToken } = computePortfolioPnl(events, balances, prices, priceAt)
        const pnl = perToken.get(TOKEN)!

        // Historical: $10 + $30 = $40 (NOT 20 KUB * current $3 = $60).
        expect(pnl.totalInvestedUsd).toBeCloseTo(40)
        expect(pnl.costBasisUsd).toBeCloseTo(40)
        expect(pnl.unrealizedUsd).toBeCloseTo(10)
    })

    it('handles selling more tokens than the accounted position without negative basis', () => {
        // Buy 50, then sell 100 (extra 50 arrived via transfer with no cost basis).
        const events = [buy(50, 10, 1), sell(100, 40, 2)]
        const balances = new Map<string, number>()
        const prices = new Map<string, number | null>()

        const { perToken } = computePortfolioPnl(events, balances, prices, flatRate)
        const pnl = perToken.get(TOKEN)!

        // avg cost = $20 / 50 = $0.4/token; proceeds 40 KUB*$2=$80;
        // costOfSold capped at position (50 tokens * $0.4 = $20) -> realized $60.
        expect(pnl.realizedUsd).toBeCloseTo(60)
        expect(pnl.costBasisUsd).toBeCloseTo(0)
        expect(pnl.unrealizedUsd).toBeCloseTo(0)
    })

    it('decodes the token leg at its real decimals (6-dec USDT), not 18', () => {
        // The token leg is 6-decimal (USDT); the native leg is always 18-decimal.
        // Without decimalsByToken the accounting position is ~1e12 too small, so
        // avgCost × current balance explodes and unrealized PnL goes to ~-$1e12.
        const USDT = '0xusdt'
        const buyUsdt: PnlSwapEvent = {
            tokenAddr: USDT,
            isBuy: true,
            amountIn: parseEther('10').toString(), // 10 KUB paid
            amountOut: parseUnits('1000', 6).toString(), // 1000 USDT received
            timestamp: 1,
        }
        const balances = new Map([[USDT, 1000]]) // holds the 1000 USDT
        const prices = new Map([[USDT, 1]]) // USDT pinned at $1 -> value $1000
        const decimals = new Map([[USDT, 6]])

        const { perToken } = computePortfolioPnl([buyUsdt], balances, prices, flatRate, decimals)
        const pnl = perToken.get(USDT)!

        // Paid 10 KUB * $2 = $20 for 1000 USDT now worth $1000 -> unrealized +$980.
        expect(pnl.totalInvestedUsd).toBeCloseTo(20)
        expect(pnl.costBasisUsd).toBeCloseTo(20)
        expect(pnl.unrealizedUsd).toBeCloseTo(980)

        // Regression guard: the old 18-decimal-everywhere path produced a wildly
        // negative figure here. Confirm we're nowhere near that.
        const broken = computePortfolioPnl([buyUsdt], balances, prices, flatRate)
        expect(broken.perToken.get(USDT)!.unrealizedUsd).toBeLessThan(-1e9)
    })

    it('returns null pnlPercent base safely and unrealized 0 when price is missing', () => {
        const events = [buy(100, 10, 1)]
        const balances = new Map([[TOKEN, 100]])
        const prices = new Map<string, number | null>([[TOKEN, null]])

        const { perToken } = computePortfolioPnl(events, balances, prices, flatRate)
        const pnl = perToken.get(TOKEN)!

        expect(pnl.unrealizedUsd).toBeCloseTo(0)
        expect(pnl.totalPnlUsd).toBeCloseTo(0)
    })
})

describe('services/dex/portfolio-pnl > computeTraderStatsByAddress', () => {
    const ALICE = '0xalice'
    const BOB = '0xbob'

    function lbEvent(e: PnlSwapEvent, sender: string): LeaderboardSwapEvent {
        return { ...e, sender }
    }

    it('matches a direct per-address computePortfolioPnl run and isolates addresses', () => {
        // Two traders trade the same token with different histories.
        const aliceEvents = [buy(100, 10, 1), sell(50, 8, 2)]
        const bobEvents = [buy(200, 30, 1)]
        const events: LeaderboardSwapEvent[] = [
            ...aliceEvents.map((e) => lbEvent(e, ALICE)),
            ...bobEvents.map((e) => lbEvent(e, BOB)),
        ]
        const balanceByAddress = new Map([
            [ALICE, new Map([[TOKEN, 50]])],
            [BOB, new Map([[TOKEN, 200]])],
        ])
        const prices = new Map([[TOKEN, 0.3]])

        const stats = computeTraderStatsByAddress(events, balanceByAddress, prices, flatRate)

        const aliceDirect = computePortfolioPnl(
            aliceEvents,
            new Map([[TOKEN, 50]]),
            prices,
            flatRate
        )
        const bobDirect = computePortfolioPnl(bobEvents, new Map([[TOKEN, 200]]), prices, flatRate)

        expect(stats.get(ALICE)!.pnlUsd).toBeCloseTo(aliceDirect.totals.totalPnlUsd)
        expect(stats.get(BOB)!.pnlUsd).toBeCloseTo(bobDirect.totals.totalPnlUsd)
        // Bob's trades must not bleed into Alice's PnL.
        expect(stats.get(ALICE)!.pnlUsd).not.toBeCloseTo(stats.get(BOB)!.pnlUsd)
    })

    it('aggregates native volume and trade/buy/sell counts per address', () => {
        const events: LeaderboardSwapEvent[] = [
            lbEvent(buy(100, 10, 1), ALICE), // +10 KUB volume
            lbEvent(sell(50, 8, 2), ALICE), // +8 KUB volume
            lbEvent(buy(200, 30, 1), BOB), // +30 KUB volume
        ]
        const stats = computeTraderStatsByAddress(events, new Map(), new Map(), flatRate)

        expect(stats.get(ALICE)!.volumeNative).toBeCloseTo(18)
        expect(stats.get(ALICE)!.tradeCount).toBe(2)
        expect(stats.get(ALICE)!.buyCount).toBe(1)
        expect(stats.get(ALICE)!.sellCount).toBe(1)

        expect(stats.get(BOB)!.volumeNative).toBeCloseTo(30)
        expect(stats.get(BOB)!.tradeCount).toBe(1)
        expect(stats.get(BOB)!.buyCount).toBe(1)
        expect(stats.get(BOB)!.sellCount).toBe(0)
    })
})
