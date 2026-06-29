import { describe, it, expect } from 'vitest'
import { formatChartPrice } from '@/lib/format'

describe('formatChartPrice', () => {
    it('uses subscript-zero notation for tiny values (subscript = leading-zero count)', () => {
        expect(formatChartPrice(9.95e-5)).toBe('0.0₄995')
        expect(formatChartPrice(9.9552e-5)).toBe('0.0₄9955') // 4 significant figures
        expect(formatChartPrice(2.376e-6)).toBe('0.0₅2376')
    })

    it('trims trailing zeros in the significant digits', () => {
        expect(formatChartPrice(5e-5)).toBe('0.0₄5')
        expect(formatChartPrice(1e-5)).toBe('0.0₄1')
    })

    it('handles mantissa rollover from rounding (9.9996e-5 → 1.0e-4)', () => {
        expect(formatChartPrice(9.9996e-5)).toBe('0.0₃1')
    })

    it('uses adaptive decimals for normal ranges', () => {
        expect(formatChartPrice(0)).toBe('0')
        expect(formatChartPrice(0.6893)).toBe('0.6893')
        expect(formatChartPrice(0.000995)).toBe('0.000995') // ≥ 0.0001 stays decimal
        expect(formatChartPrice(12.3456)).toBe('12.346')
        expect(formatChartPrice(1234.5)).toBe('1234.50')
    })

    it('returns "0" for non-finite input', () => {
        expect(formatChartPrice(Infinity)).toBe('0')
        expect(formatChartPrice(NaN)).toBe('0')
    })
})
