import { describe, it, expect } from 'vitest'
import { calculatePrice, calculateMarketCapValue, aggregateCandlesticks } from '@/services/chart'

const NATIVE = (n: number) => BigInt(n) * 10n ** 18n
const TOKENS = (n: number) => BigInt(n) * 10n ** 18n

const makeEvent = (
    timestamp: number,
    isBuy: boolean,
    amountIn: bigint,
    amountOut: bigint,
    reserveIn: bigint,
    reserveOut: bigint
) => ({
    timestamp,
    isBuy,
    amountIn,
    amountOut,
    reserveIn,
    reserveOut,
})

describe('calculatePrice', () => {
    it('returns 0 when reserveIn is 0', () => {
        expect(calculatePrice(makeEvent(1000, true, 0n, 100n, 0n, TOKENS(900)))).toBe(0)
    })

    it('returns 0 when reserveOut is 0', () => {
        expect(calculatePrice(makeEvent(1000, true, NATIVE(100), 0n, NATIVE(100), 0n))).toBe(0)
    })

    it('calculates price for buy events from reserves', () => {
        const event = makeEvent(1000, true, NATIVE(10), TOKENS(100), NATIVE(100), TOKENS(900))
        expect(calculatePrice(event)).toBeCloseTo(3500 / 900, 4)
    })

    it('calculates price for sell events from reserves', () => {
        const event = makeEvent(1000, false, TOKENS(50), NATIVE(5), TOKENS(1000), NATIVE(50))
        expect(calculatePrice(event)).toBeCloseTo(3450 / 1000, 4)
    })
})

describe('calculateMarketCapValue', () => {
    it('returns price * 1 billion', () => {
        const event = makeEvent(1000, true, NATIVE(10), TOKENS(100), NATIVE(100), TOKENS(900))
        const price = calculatePrice(event)
        expect(calculateMarketCapValue(event)).toBeCloseTo(price * 1_000_000_000)
    })
})

describe('aggregateCandlesticks', () => {
    it('returns empty array for empty events', () => {
        expect(aggregateCandlesticks([], '1h')).toEqual([])
    })

    it('creates correct candlestick from single event', () => {
        const events = [makeEvent(1000, true, NATIVE(10), TOKENS(100), NATIVE(100), TOKENS(900))]
        const candles = aggregateCandlesticks(events, '1h', 'price')
        expect(candles).toHaveLength(1)
        const candle = candles[0]!
        expect(candle.time).toBe(0)
        expect(candle.open).toBeGreaterThan(0)
        expect(candle.close).toBeGreaterThan(0)
        expect(candle.volume).toBeGreaterThan(0)
    })

    it('uses pre-swap price as candle open for first trade in bucket', () => {
        // Buy: post-swap native=110, tokens=800
        // Pre-swap: native=100, tokens=900 → open = 3500/900 ≈ 3.889
        // Post-swap price = 3510/800 ≈ 4.388
        const events = [makeEvent(1000, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800))]
        const candles = aggregateCandlesticks(events, '1h', 'price')
        expect(candles).toHaveLength(1)
        const candle = candles[0]!
        expect(candle.open).toBeCloseTo(3500 / 900, 4)
        expect(candle.close).toBeCloseTo(3510 / 800, 4)
    })

    it('open equals previous candle close (no gaps)', () => {
        // Trade 1 at t=100: buy → post-swap native=110, tokens=800
        const event1 = makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800))

        // Trade 2 at t=3700 (next hour): sell
        // Pre-swap for this trade: native=110, tokens=800 (resting state from event1)
        // So candle2.open = (110+3400)/800 = candle1.close
        const event2 = makeEvent(3700, false, TOKENS(50), NATIVE(5), TOKENS(850), NATIVE(105))

        const candles = aggregateCandlesticks([event1, event2], '1h', 'price')
        expect(candles.length).toBeGreaterThanOrEqual(2)
        expect(candles[1]!.open).toBeCloseTo(candles[0]!.close, 6)
    })

    it('open equals previous candle close for sell-then-buy', () => {
        // Trade 1 at t=100: sell → post-swap native=95, tokens=850
        const event1 = makeEvent(100, false, TOKENS(50), NATIVE(5), TOKENS(850), NATIVE(95))

        // Trade 2 at t=3700 (next hour): buy
        // Pre-swap: native=95, tokens=850 (resting state)
        const event2 = makeEvent(3700, true, NATIVE(10), TOKENS(100), NATIVE(105), TOKENS(750))

        const candles = aggregateCandlesticks([event1, event2], '1h', 'price')
        expect(candles.length).toBeGreaterThanOrEqual(2)
        expect(candles[1]!.open).toBeCloseTo(candles[0]!.close, 6)
    })

    it('aggregates events in same time bucket', () => {
        const events = [
            makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800)),
            makeEvent(200, true, NATIVE(20), TOKENS(50), NATIVE(130), TOKENS(750)),
        ]
        const candles = aggregateCandlesticks(events, '1h', 'price')
        expect(candles).toHaveLength(1)
        expect(candles[0]!.volume).toBeGreaterThan(0)
        expect(candles[0]!.close).toBeCloseTo(calculatePrice(events[1]!), 6)
    })

    it('creates separate candles for different time buckets', () => {
        const events = [
            makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800)),
            makeEvent(3700, true, NATIVE(10), TOKENS(100), NATIVE(120), TOKENS(700)),
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles).toHaveLength(2)
    })

    it('forward-fills missing time buckets between trades', () => {
        const events = [
            makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800)),
            makeEvent(7200 + 100, true, NATIVE(10), TOKENS(50), NATIVE(120), TOKENS(750)),
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles).toHaveLength(3)
    })

    it('forward-filled candles use prev close for continuity', () => {
        const events = [
            makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800)),
            makeEvent(7200 + 100, true, NATIVE(10), TOKENS(50), NATIVE(120), TOKENS(750)),
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles[1]!.open).toBe(candles[0]!.close)
        expect(candles[1]!.high).toBe(candles[0]!.close)
        expect(candles[1]!.low).toBe(candles[0]!.close)
        expect(candles[1]!.close).toBe(candles[0]!.close)
        expect(candles[1]!.volume).toBe(0)
    })

    it('works with different timeframes', () => {
        const events = [makeEvent(100, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800))]
        const candles1m = aggregateCandlesticks(events, '1m')
        const candles1d = aggregateCandlesticks(events, '1d')
        expect(candles1m[0]!.time).toBe(60)
        expect(candles1d[0]!.time).toBe(0)
    })

    it('candle high/low include open price', () => {
        // Buy: pre-swap price < post-swap price (buy pushes price up)
        const events = [makeEvent(1000, true, NATIVE(10), TOKENS(100), NATIVE(110), TOKENS(800))]
        const candles = aggregateCandlesticks(events, '1h', 'price')
        const candle = candles[0]!
        expect(candle.high).toBe(Math.max(candle.open, candle.close))
        expect(candle.low).toBe(Math.min(candle.open, candle.close))
    })
})
