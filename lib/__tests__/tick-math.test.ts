import { describe, it, expect } from 'vitest'
import {
    MAX_TICK,
    MIN_TICK,
    computeInitialSqrtPriceX96,
    getFullRange,
    isFullRange,
    isInRange,
    snapTickRange,
    sortTokens,
} from '@/lib/tick-math'

const LOWER = '0x1111111111111111111111111111111111111111'
const UPPER = '0xffffffffffffffffffffffffffffffffffffffff'
const SPACINGS = [1, 10, 50, 60, 200]

describe('lib/tick-math', () => {
    describe('isInRange', () => {
        it('counts a tick sitting exactly on the lower bound as in range', () => {
            expect(isInRange(100, 100, 200)).toBe(true)
        })

        // The upper bound is exclusive, matching how the pool itself accrues fees. Getting this
        // backwards would light the in-range badge for a position that has stopped earning.
        it('counts a tick sitting exactly on the upper bound as out of range', () => {
            expect(isInRange(200, 100, 200)).toBe(false)
        })

        it('rejects ticks on either side of the range', () => {
            expect(isInRange(99, 100, 200)).toBe(false)
            expect(isInRange(201, 100, 200)).toBe(false)
        })

        it('handles a full-range position', () => {
            expect(isInRange(0, MIN_TICK, MAX_TICK)).toBe(true)
        })
    })

    describe('sortTokens', () => {
        it('orders by ascending address whichever way the pair is handed in', () => {
            expect(sortTokens({ address: LOWER }, { address: UPPER })).toEqual([
                { address: LOWER },
                { address: UPPER },
            ])
            expect(sortTokens({ address: UPPER }, { address: LOWER })).toEqual([
                { address: LOWER },
                { address: UPPER },
            ])
        })

        // Checksummed addresses mix cases, and an uppercase hex digit sorts before every lowercase
        // letter. Comparing raw would order a pair differently than the pool does.
        it('compares lowercased, so checksum casing does not change the order', () => {
            const [first] = sortTokens({ address: UPPER.toUpperCase() }, { address: LOWER })
            expect(first.address).toBe(LOWER)
        })

        // add-liquidity derives isReversed from the returned tuple, and usePools reads fields the
        // helper never sees, so the arguments have to come back through untouched.
        it('hands back the argument objects themselves, extra fields intact', () => {
            const a = { address: UPPER, symbol: 'A' }
            const b = { address: LOWER, symbol: 'B' }
            const [first, second] = sortTokens(a, b)
            expect(first).toBe(b)
            expect(second).toBe(a)
        })
    })

    describe('snapTickRange', () => {
        it('lands both bounds on multiples of the spacing', () => {
            const { tickLower, tickUpper } = snapTickRange(1234, 5678, 60)
            expect(tickLower % 60).toBe(0)
            expect(tickUpper % 60).toBe(0)
        })

        // The range slider snaps on every drag frame, so the two handles pass through each other.
        // Without the nudge it would hand back an inverted range and mint would revert.
        it('pushes the upper bound one spacing clear when the inputs collapse', () => {
            const { tickLower, tickUpper } = snapTickRange(1234, 1234, 60)
            expect(tickUpper - tickLower).toBe(60)
        })

        it('pushes the upper bound one spacing clear when the inputs are inverted', () => {
            const { tickLower, tickUpper } = snapTickRange(2000, 1000, 60)
            expect(tickUpper - tickLower).toBe(60)
        })

        it('keeps a range snapped past the extremes inside the tick bounds', () => {
            const { tickLower, tickUpper } = snapTickRange(MIN_TICK - 5000, MAX_TICK + 5000, 60)
            expect(tickLower).toBeGreaterThanOrEqual(MIN_TICK)
            expect(tickUpper).toBeLessThanOrEqual(MAX_TICK)
        })
    })

    describe('getFullRange', () => {
        it.each(SPACINGS)('returns aligned, mintable bounds at spacing %i', (spacing) => {
            const { tickLower, tickUpper } = getFullRange(spacing)
            // tickLower is negative, so the remainder comes back as -0 when it is aligned.
            expect(Math.abs(tickLower % spacing)).toBe(0)
            expect(tickUpper % spacing).toBe(0)
            expect(tickLower).toBeGreaterThanOrEqual(MIN_TICK)
            expect(tickUpper).toBeLessThanOrEqual(MAX_TICK)
        })
    })

    describe('isFullRange', () => {
        // The contract between the two halves of the UI: add-liquidity mints the full preset from
        // getFullRange, and the positions list has to recognise what came back as full range.
        // Aligning the bounds to a spacing moves them inwards, so this only holds thanks to the
        // tolerance.
        it.each(SPACINGS)('accepts what getFullRange produced at spacing %i', (spacing) => {
            const { tickLower, tickUpper } = getFullRange(spacing)
            expect(isFullRange(tickLower, tickUpper)).toBe(true)
        })

        it('rejects a wide range that still falls well short of the bounds', () => {
            expect(isFullRange(MIN_TICK + 1000, MAX_TICK - 1000)).toBe(false)
        })

        it('accepts a range sitting exactly on the tolerance and rejects one a tick past it', () => {
            expect(isFullRange(MIN_TICK + 256, MAX_TICK - 256)).toBe(true)
            expect(isFullRange(MIN_TICK + 257, MAX_TICK - 256)).toBe(false)
            expect(isFullRange(MIN_TICK + 256, MAX_TICK - 257)).toBe(false)
        })
    })

    describe('computeInitialSqrtPriceX96', () => {
        const Q96 = 2n ** 96n
        const MIN_SQRT_RATIO = 4295128739n

        it('maps a price of 1 between equal-decimal tokens onto Q96', () => {
            expect(computeInitialSqrtPriceX96({ price: '1', decimals0: 18, decimals1: 18 })).toBe(
                Q96
            )
        })

        it('takes the square root of the price rather than the price itself', () => {
            expect(computeInitialSqrtPriceX96({ price: '4', decimals0: 18, decimals1: 18 })).toBe(
                2n * Q96
            )
        })

        // The pool prices raw token units, so a pair whose decimals differ by 12 sits a factor of
        // 1e6 apart in sqrt space at the very same human-readable price. Dropping this adjustment
        // would initialise a new pool 1e12 away from the price the user typed.
        it('scales by the decimal gap between the two tokens', () => {
            const even = computeInitialSqrtPriceX96({ price: '1', decimals0: 18, decimals1: 18 })
            const fewerOnToken1 = computeInitialSqrtPriceX96({
                price: '1',
                decimals0: 18,
                decimals1: 6,
            })
            const fewerOnToken0 = computeInitialSqrtPriceX96({
                price: '1',
                decimals0: 6,
                decimals1: 18,
            })

            expect(Number(even) / Number(fewerOnToken1)).toBeCloseTo(1e6, -1)
            expect(Number(fewerOnToken0) / Number(even)).toBeCloseTo(1e6, -1)
        })

        it('rises with the price', () => {
            const lower = computeInitialSqrtPriceX96({ price: '1500', decimals0: 18, decimals1: 6 })
            const higher = computeInitialSqrtPriceX96({
                price: '1500.5',
                decimals0: 18,
                decimals1: 6,
            })
            expect(higher).toBeGreaterThan(lower)
        })

        // The dialog screens these out before calling, but the floor is what keeps a stray value
        // from reaching BigInt() as NaN and throwing inside a render.
        it.each(['0', '-1', 'not a price', ''])(
            'floors an unusable price (%j) at MIN_SQRT_RATIO',
            (price) => {
                expect(computeInitialSqrtPriceX96({ price, decimals0: 18, decimals1: 18 })).toBe(
                    MIN_SQRT_RATIO
                )
            }
        )
    })
})
