import { describe, it, expect } from 'vitest'
import {
    tickToSqrtPriceX96,
    sqrtPriceX96ToTick,
    tickToPrice,
    priceToTick,
    sqrtPriceX96ToPrice,
    priceToSqrtPriceX96,
    getAmountsForLiquidity,
    calculateAmount1FromAmount0,
    calculateAmount0FromAmount1,
    isInRange,
    getTickSpacing,
    nearestUsableTick,
    getPresetRange,
    calculateRangePercentage,
    calculateMinAmounts,
    sortTokens,
    MIN_TICK,
    MAX_TICK,
    MIN_SQRT_RATIO,
    bigIntSqrt,
    calculateGraduationSqrtPriceX96,
} from '@/lib/liquidity-helpers'

describe('tickToSqrtPriceX96', () => {
    it('returns ~2^96 for tick 0', () => {
        const result = tickToSqrtPriceX96(0)
        const q96 = 2n ** 96n
        expect(Number(result) / Number(q96)).toBeCloseTo(1.0, 4)
    })

    it('round-trips with sqrtPriceX96ToTick for tick 0', () => {
        expect(sqrtPriceX96ToTick(tickToSqrtPriceX96(0))).toBe(0)
    })
})

describe('tickToPrice and priceToTick', () => {
    it('round-trips approximately for same decimals', () => {
        const tick = 1000
        const price = tickToPrice(tick, 18, 18)
        const recoveredTick = priceToTick(price, 18, 18)
        expect(Math.abs(recoveredTick - tick)).toBeLessThanOrEqual(1)
    })

    it('handles different decimal pairs', () => {
        const tick = 500
        const price = tickToPrice(tick, 6, 18)
        const recoveredTick = priceToTick(price, 6, 18)
        expect(Math.abs(recoveredTick - tick)).toBeLessThanOrEqual(2)
    })
})

describe('sqrtPriceX96ToPrice', () => {
    it('returns "0" for extremely small values', () => {
        expect(sqrtPriceX96ToPrice(1n, 18, 18)).toBe('0')
    })

    it('formats values in normal range', () => {
        const sqrtPrice = tickToSqrtPriceX96(0)
        const price = sqrtPriceX96ToPrice(sqrtPrice, 18, 18)
        expect(parseFloat(price)).toBeCloseTo(1.0, 2)
    })
})

describe('priceToSqrtPriceX96', () => {
    it('returns MIN_SQRT_RATIO for zero or negative input', () => {
        expect(priceToSqrtPriceX96('0', 18, 18)).toBe(MIN_SQRT_RATIO)
        expect(priceToSqrtPriceX96('-1', 18, 18)).toBe(MIN_SQRT_RATIO)
    })

    it('round-trips approximately with sqrtPriceX96ToPrice', () => {
        const sqrtPrice = tickToSqrtPriceX96(1000)
        const price = sqrtPriceX96ToPrice(sqrtPrice, 18, 18)
        const recovered = priceToSqrtPriceX96(price, 18, 18)
        // Allow ~0.1% tolerance due to floating point
        const ratio = Number(recovered) / Number(sqrtPrice)
        expect(ratio).toBeCloseTo(1.0, 2)
    })
})

describe('getAmountsForLiquidity', () => {
    const sqrtPriceLower = tickToSqrtPriceX96(-1000)
    const sqrtPriceUpper = tickToSqrtPriceX96(1000)
    const liquidity = 10n ** 18n

    it('returns only amount0 when current price is below range', () => {
        const sqrtPriceCurrent = tickToSqrtPriceX96(-2000)
        const result = getAmountsForLiquidity(
            sqrtPriceCurrent,
            sqrtPriceLower,
            sqrtPriceUpper,
            liquidity
        )
        expect(result.amount0).toBeGreaterThan(0n)
        expect(result.amount1).toBe(0n)
    })

    it('returns only amount1 when current price is above range', () => {
        const sqrtPriceCurrent = tickToSqrtPriceX96(2000)
        const result = getAmountsForLiquidity(
            sqrtPriceCurrent,
            sqrtPriceLower,
            sqrtPriceUpper,
            liquidity
        )
        expect(result.amount0).toBe(0n)
        expect(result.amount1).toBeGreaterThan(0n)
    })

    it('returns both amounts when current price is in range', () => {
        const sqrtPriceCurrent = tickToSqrtPriceX96(0)
        const result = getAmountsForLiquidity(
            sqrtPriceCurrent,
            sqrtPriceLower,
            sqrtPriceUpper,
            liquidity
        )
        expect(result.amount0).toBeGreaterThan(0n)
        expect(result.amount1).toBeGreaterThan(0n)
    })

    it('handles swapped sqrtPriceA/sqrtPriceB order', () => {
        const sqrtPriceCurrent = tickToSqrtPriceX96(0)
        const result1 = getAmountsForLiquidity(
            sqrtPriceCurrent,
            sqrtPriceLower,
            sqrtPriceUpper,
            liquidity
        )
        const result2 = getAmountsForLiquidity(
            sqrtPriceCurrent,
            sqrtPriceUpper,
            sqrtPriceLower,
            liquidity
        )
        expect(result1).toEqual(result2)
    })
})

describe('calculateAmount1FromAmount0', () => {
    it('returns 0n when amount0 is 0n', () => {
        expect(
            calculateAmount1FromAmount0(
                tickToSqrtPriceX96(0),
                tickToSqrtPriceX96(-1000),
                tickToSqrtPriceX96(1000),
                0n
            )
        ).toBe(0n)
    })

    it('returns 0n when price is below range', () => {
        expect(
            calculateAmount1FromAmount0(
                tickToSqrtPriceX96(-2000),
                tickToSqrtPriceX96(-1000),
                tickToSqrtPriceX96(1000),
                100n
            )
        ).toBe(0n)
    })

    it('returns 0n when price is above range', () => {
        expect(
            calculateAmount1FromAmount0(
                tickToSqrtPriceX96(2000),
                tickToSqrtPriceX96(-1000),
                tickToSqrtPriceX96(1000),
                100n
            )
        ).toBe(0n)
    })

    it('returns correct value when price is in range', () => {
        const result = calculateAmount1FromAmount0(
            tickToSqrtPriceX96(0),
            tickToSqrtPriceX96(-1000),
            tickToSqrtPriceX96(1000),
            10n ** 18n
        )
        expect(result).toBeGreaterThan(0n)
    })
})

describe('calculateAmount0FromAmount1', () => {
    it('returns 0n when amount1 is 0n', () => {
        expect(
            calculateAmount0FromAmount1(
                tickToSqrtPriceX96(0),
                tickToSqrtPriceX96(-1000),
                tickToSqrtPriceX96(1000),
                0n
            )
        ).toBe(0n)
    })

    it('returns 0n when price is below range', () => {
        expect(
            calculateAmount0FromAmount1(
                tickToSqrtPriceX96(-2000),
                tickToSqrtPriceX96(-1000),
                tickToSqrtPriceX96(1000),
                100n
            )
        ).toBe(0n)
    })

    it('returns 0n when price is above range', () => {
        expect(
            calculateAmount0FromAmount1(
                tickToSqrtPriceX96(2000),
                tickToSqrtPriceX96(-1000),
                tickToSqrtPriceX96(1000),
                100n
            )
        ).toBe(0n)
    })

    it('returns correct value when price is in range', () => {
        const result = calculateAmount0FromAmount1(
            tickToSqrtPriceX96(0),
            tickToSqrtPriceX96(-1000),
            tickToSqrtPriceX96(1000),
            10n ** 18n
        )
        expect(result).toBeGreaterThan(0n)
    })
})

describe('isInRange', () => {
    it('returns true when tick is between bounds', () => {
        expect(isInRange(0, -100, 100)).toBe(true)
    })

    it('returns true at lower bound (inclusive)', () => {
        expect(isInRange(-100, -100, 100)).toBe(true)
    })

    it('returns false at upper bound (exclusive)', () => {
        expect(isInRange(100, -100, 100)).toBe(false)
    })
})

describe('getTickSpacing', () => {
    it('returns correct spacing for known fee tiers', () => {
        expect(getTickSpacing(100)).toBe(1)
        expect(getTickSpacing(500)).toBe(10)
        expect(getTickSpacing(3000)).toBe(60)
        expect(getTickSpacing(10000)).toBe(200)
    })

    it('defaults to 60 for unknown fee tier', () => {
        expect(getTickSpacing(9999)).toBe(60)
    })
})

describe('nearestUsableTick', () => {
    it('snaps to nearest multiple of tick spacing', () => {
        expect(nearestUsableTick(65, 60)).toBe(60)
        expect(nearestUsableTick(35, 60)).toBe(60)
    })

    it('clamps to valid range', () => {
        const result = nearestUsableTick(MIN_TICK, 60)
        expect(result).toBeGreaterThanOrEqual(MIN_TICK)
    })
})

describe('getPresetRange', () => {
    const tickSpacing = 60

    it('full range uses min/max ticks', () => {
        const { tickLower, tickUpper } = getPresetRange(0, tickSpacing, 'full')
        expect(tickLower).toBeLessThan(MIN_TICK + tickSpacing * 2)
        expect(tickUpper).toBeGreaterThan(MAX_TICK - tickSpacing * 2)
    })

    it('safe range is approximately +/-4055 ticks', () => {
        const { tickLower, tickUpper } = getPresetRange(0, tickSpacing, 'safe')
        expect(tickLower).toBeCloseTo(-4055, -2)
        expect(tickUpper).toBeCloseTo(4055, -2)
    })

    it('common range is approximately +/-1823 ticks', () => {
        const { tickLower, tickUpper } = getPresetRange(0, tickSpacing, 'common')
        expect(tickLower).toBeCloseTo(-1823, -2)
        expect(tickUpper).toBeCloseTo(1823, -2)
    })

    it('narrow range is approximately +/-488 ticks', () => {
        const { tickLower, tickUpper } = getPresetRange(0, tickSpacing, 'narrow')
        expect(tickLower).toBeCloseTo(-488, -2)
        expect(tickUpper).toBeCloseTo(488, -2)
    })

    it('custom returns both bounds at current tick', () => {
        const { tickLower, tickUpper } = getPresetRange(100, tickSpacing, 'custom')
        expect(tickLower).toBe(nearestUsableTick(100, tickSpacing))
        expect(tickUpper).toBe(nearestUsableTick(100, tickSpacing))
    })
})

describe('calculateRangePercentage', () => {
    it('returns negative lowerPercent and positive upperPercent for symmetric range', () => {
        const { lowerPercent, upperPercent } = calculateRangePercentage(0, -1000, 1000)
        expect(lowerPercent).toBeLessThan(0)
        expect(upperPercent).toBeGreaterThan(0)
    })

    it('returns near 0% for same tick bounds', () => {
        const { lowerPercent, upperPercent } = calculateRangePercentage(0, 0, 0)
        expect(lowerPercent).toBe(0)
        expect(upperPercent).toBe(0)
    })
})

describe('calculateMinAmounts', () => {
    it('applies slippage to both amounts', () => {
        const result = calculateMinAmounts(10000n, 20000n, 100) // 1%
        expect(result.amount0Min).toBe(9900n)
        expect(result.amount1Min).toBe(19800n)
    })

    it('returns same amounts for 0 slippage', () => {
        const result = calculateMinAmounts(10000n, 20000n, 0)
        expect(result.amount0Min).toBe(10000n)
        expect(result.amount1Min).toBe(20000n)
    })
})

describe('sortTokens', () => {
    it('sorts by lowercase address', () => {
        const tokenA = { address: '0xBbb' }
        const tokenB = { address: '0xAaa' }
        const [first, second] = sortTokens(tokenA, tokenB)
        expect(first.address).toBe('0xAaa')
        expect(second.address).toBe('0xBbb')
    })

    it('preserves order when a < b', () => {
        const tokenA = { address: '0x111' }
        const tokenB = { address: '0x222' }
        const [first, second] = sortTokens(tokenA, tokenB)
        expect(first).toBe(tokenA)
        expect(second).toBe(tokenB)
    })
})

describe('bigIntSqrt', () => {
    it('returns 0 for 0', () => {
        expect(bigIntSqrt(0n)).toBe(0n)
    })

    it('returns 1 for 1', () => {
        expect(bigIntSqrt(1n)).toBe(1n)
    })

    it('returns 2 for 4', () => {
        expect(bigIntSqrt(4n)).toBe(2n)
    })

    it('returns 3 for 9', () => {
        expect(bigIntSqrt(9n)).toBe(3n)
    })

    it('returns 10 for 100', () => {
        expect(bigIntSqrt(100n)).toBe(10n)
    })

    it('returns floor(sqrt(n)) for non-perfect squares', () => {
        expect(bigIntSqrt(2n)).toBe(1n) // sqrt(2) ≈ 1.414
        expect(bigIntSqrt(3n)).toBe(1n) // sqrt(3) ≈ 1.732
        expect(bigIntSqrt(5n)).toBe(2n) // sqrt(5) ≈ 2.236
        expect(bigIntSqrt(8n)).toBe(2n) // sqrt(8) ≈ 2.828
    })

    it('handles large numbers (2^96)', () => {
        const q96 = 2n ** 96n
        const result = bigIntSqrt(q96)
        expect(result).toBe(2n ** 48n)
    })

    it('handles very large numbers (2^192)', () => {
        const q192 = 2n ** 192n
        const result = bigIntSqrt(q192)
        expect(result).toBe(2n ** 96n)
    })

    it('throws for negative input', () => {
        expect(() => bigIntSqrt(-1n)).toThrow('square root of negative')
    })
})

describe('calculateGraduationSqrtPriceX96', () => {
    // Stuck token scenario: tokenAddr < wrappedNative
    // Token: 0x3671E189BFb60fB434A902F2274f6546FCE779db
    // tKKUB: 0x700D3ba307E1256e509eD3E45D6f9dff441d6907
    const tokenAddr = '0x3671E189BFb60fB434A902F2274f6546FCE779db' as `0x${string}`
    const wrappedNative = '0x700D3ba307E1256e509eD3E45D6f9dff441d6907' as `0x${string}`
    const nativeReserve = 4009500000000000000000n // ~4010 KUB
    const tokenReserve = 461366962461691276297068760n // ~461M tokens

    it('returns non-zero sqrtPriceX96 when tokenAddr < wrappedNative', () => {
        // The contract's buggy formula would give 0 here due to integer division
        const result = calculateGraduationSqrtPriceX96(
            tokenAddr,
            wrappedNative,
            nativeReserve,
            tokenReserve
        )
        expect(result).toBeGreaterThan(0n)
    })

    it('matches the known correct value for the stuck token', () => {
        const result = calculateGraduationSqrtPriceX96(
            tokenAddr,
            wrappedNative,
            nativeReserve,
            tokenReserve
        )
        // This is the value computed by the Python rescue script
        const expected = 233561602564036164489853658n
        expect(result).toBe(expected)
    })

    it('returns a value within uint160 range', () => {
        const result = calculateGraduationSqrtPriceX96(
            tokenAddr,
            wrappedNative,
            nativeReserve,
            tokenReserve
        )
        const maxUint160 = (1n << 160n) - 1n
        expect(result).toBeLessThanOrEqual(maxUint160)
    })

    it('works when tokenAddr > wrappedNative (no bug case)', () => {
        // Use a higher address to test the normal case
        const highAddr = '0x99999999990FC47611b74827486218f3398A4abD' as `0x${string}`
        const result = calculateGraduationSqrtPriceX96(
            highAddr,
            wrappedNative,
            nativeReserve,
            tokenReserve
        )
        expect(result).toBeGreaterThan(0n)
    })

    it('throws for zero reserves', () => {
        expect(() =>
            calculateGraduationSqrtPriceX96(tokenAddr, wrappedNative, 0n, tokenReserve)
        ).toThrow('Invalid reserves')
        expect(() =>
            calculateGraduationSqrtPriceX96(tokenAddr, wrappedNative, nativeReserve, 0n)
        ).toThrow('Invalid reserves')
    })

    it('produces consistent results regardless of reserve magnitude', () => {
        // Same ratio, different magnitudes
        const result1 = calculateGraduationSqrtPriceX96(tokenAddr, wrappedNative, 1000n, 2000n)
        const result2 = calculateGraduationSqrtPriceX96(
            tokenAddr,
            wrappedNative,
            1000000n,
            2000000n
        )
        expect(result1).toBe(result2)
    })
})
