import { describe, it, expect } from 'vitest'
import { makePriceAt, type NativeUsdPricePoint } from '@/hooks/useNativeUsdPriceHistory'

const series: NativeUsdPricePoint[] = [
    { timestamp: 100, price: 1 },
    { timestamp: 200, price: 2 },
    { timestamp: 300, price: 3 },
]

describe('makePriceAt', () => {
    it('returns the latest point at or before the timestamp', () => {
        const priceAt = makePriceAt(series, null)
        expect(priceAt(100)).toBe(1)
        expect(priceAt(150)).toBe(1)
        expect(priceAt(200)).toBe(2)
        expect(priceAt(250)).toBe(2)
        expect(priceAt(300)).toBe(3)
        expect(priceAt(9999)).toBe(3)
    })

    it('falls back to the earliest point for timestamps before the series', () => {
        const priceAt = makePriceAt(series, 42)
        expect(priceAt(50)).toBe(1)
    })

    it('uses fallbackPrice when there is no history', () => {
        expect(makePriceAt([], 7)(123)).toBe(7)
        expect(makePriceAt([], null)(123)).toBe(0)
    })
})
