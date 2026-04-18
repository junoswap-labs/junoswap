import { describe, it, expect } from 'vitest'
import { calculatePrice, calculateMarketCapValue, aggregateCandlesticks } from '@/services/chart'

const makeEvent = (timestamp: number, isBuy: boolean, amountIn: bigint, amountOut: bigint) => ({
    timestamp,
    isBuy,
    amountIn,
    amountOut,
})

describe('calculatePrice', () => {
    it('returns 0 when amountIn is 0', () => {
        expect(calculatePrice(makeEvent(1000, true, 0n, 100n))).toBe(0)
    })

    it('returns 0 when amountOut is 0', () => {
        expect(calculatePrice(makeEvent(1000, true, 100n, 0n))).toBe(0)
    })

    it('calculates price for buy events (inNum / outNum)', () => {
        // 1 KUB = 10^18 wei, so 2 KUB / 100 tokens
        const event = makeEvent(1000, true, 2n * 10n ** 18n, 100n * 10n ** 18n)
        expect(calculatePrice(event)).toBeCloseTo(0.02)
    })

    it('calculates price for sell events (outNum / inNum)', () => {
        // sell 100 tokens for 2 KUB → price = 2/100 = 0.02
        const event = makeEvent(1000, false, 100n * 10n ** 18n, 2n * 10n ** 18n)
        expect(calculatePrice(event)).toBeCloseTo(0.02)
    })
})

describe('calculateMarketCapValue', () => {
    it('returns price * 1 billion', () => {
        const event = makeEvent(1000, true, 2n * 10n ** 18n, 100n * 10n ** 18n)
        const price = calculatePrice(event)
        expect(calculateMarketCapValue(event)).toBeCloseTo(price * 1_000_000_000)
    })
})

describe('aggregateCandlesticks', () => {
    it('returns empty array for empty events', () => {
        expect(aggregateCandlesticks([], '1h')).toEqual([])
    })

    it('creates correct candlestick from single event', () => {
        const events = [makeEvent(1000, true, 10n ** 18n, 100n * 10n ** 18n)]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles).toHaveLength(1)
        const candle = candles[0]!
        expect(candle.time).toBe(0)
        expect(candle.open).toBeGreaterThan(0)
        expect(candle.high).toBe(candle.low)
        expect(candle.close).toBe(candle.open)
        expect(candle.volume).toBeGreaterThan(0)
    })

    it('aggregates events in same time bucket', () => {
        const events = [
            makeEvent(100, true, 10n ** 18n, 100n * 10n ** 18n),
            makeEvent(200, true, 20n ** 18n, 50n * 10n ** 18n),
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles).toHaveLength(1)
        expect(candles[0]!.volume).toBeGreaterThan(0)
    })

    it('creates separate candles for different time buckets', () => {
        const events = [
            makeEvent(100, true, 10n ** 18n, 100n * 10n ** 18n),
            makeEvent(3700, true, 10n ** 18n, 100n * 10n ** 18n), // +1 hour
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles).toHaveLength(2)
    })

    it('forward-fills missing time buckets', () => {
        // Two events 3 hours apart in 1h timeframe → should produce 3 candles
        const events = [
            makeEvent(100, true, 10n ** 18n, 100n * 10n ** 18n),
            makeEvent(7200 + 100, true, 10n ** 18n, 100n * 10n ** 18n),
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles).toHaveLength(3)
    })

    it('links each candle open to previous close', () => {
        const events = [
            makeEvent(100, true, 10n ** 18n, 100n * 10n ** 18n),
            makeEvent(3700, true, 5n * 10n ** 18n, 200n * 10n ** 18n),
        ]
        const candles = aggregateCandlesticks(events, '1h')
        expect(candles.length).toBeGreaterThanOrEqual(2)
        expect(candles[1]!.open).toBe(candles[0]!.close)
    })

    it('works with different timeframes', () => {
        const events = [makeEvent(100, true, 10n ** 18n, 100n * 10n ** 18n)]
        const candles1m = aggregateCandlesticks(events, '1m')
        const candles1d = aggregateCandlesticks(events, '1d')
        expect(candles1m[0]!.time).toBe(60) // floor(100/60)*60
        expect(candles1d[0]!.time).toBe(0) // floor(100/86400)*86400
    })
})
