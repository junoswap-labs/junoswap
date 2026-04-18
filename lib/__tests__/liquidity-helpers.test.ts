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
