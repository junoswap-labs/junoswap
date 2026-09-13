import { describe, it, expect } from 'vitest'
import {
    computeDependentAmount,
    defaultFeeTier,
    formatFeeTier,
    v3FeeTiers,
} from '@/lib/liquidity-helpers'

const BSC = 56
const KUB = 96
const NO_V3_CHAIN = 137

// A range straddling tick 0, with the pool price parked at tick 0 — the ordinary in-range case.
const TICK_LOWER = -1000
const TICK_UPPER = 1000
const SQRT_PRICE_AT_TICK_0 = 79228162514264337593543950336n
// The prices exactly on the range's own bounds, tick 1000 and tick -1000.
const SQRT_PRICE_AT_UPPER = 83290069058676223003182343270n
const SQRT_PRICE_AT_LOWER = 75364347830767020784054125655n

const inRange = {
    sqrtPriceX96: SQRT_PRICE_AT_TICK_0,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
}

describe('lib/liquidity-helpers', () => {
    describe('v3FeeTiers', () => {
        // getDexConfig defaults to junoswap, which has no V3 on BSC/Base/Worldchain. Resolving the
        // chain's own V3 DEX is what keeps the fee dropdown from rendering empty there.
        it('reads the tiers off the chain’s own V3 DEX, not the default one', () => {
            expect(v3FeeTiers(BSC)).toEqual([100, 500, 2500, 10000])
        })

        it('falls back to the standard tiers on a chain with no V3 deployment', () => {
            expect(v3FeeTiers(NO_V3_CHAIN)).toEqual([100, 500, 3000, 10000])
        })
    })

    describe('defaultFeeTier', () => {
        it('snaps to the nearest offered tier when the preferred 3000 is absent', () => {
            expect(defaultFeeTier(BSC)).toBe(2500)
        })

        it('keeps the preferred tier on a chain that offers it', () => {
            expect(defaultFeeTier(KUB)).toBe(3000)
        })
    })

    describe('formatFeeTier', () => {
        it('renders hundredths of a bip as a percentage', () => {
            expect(formatFeeTier(2500)).toBe('0.25%')
        })
    })

    describe('computeDependentAmount', () => {
        it('pairs a token0 deposit with the token1 the range needs', () => {
            expect(
                computeDependentAmount({ ...inRange, amount: 10n ** 18n, side: 'token0' })
            ).toBeGreaterThan(0n)
        })

        it('pairs a token1 deposit with the token0 the range needs', () => {
            expect(
                computeDependentAmount({ ...inRange, amount: 10n ** 18n, side: 'token1' })
            ).toBeGreaterThan(0n)
        })

        // Both bounds are inclusive: a price sitting exactly on one already makes the position
        // single-sided, so there is no dependent amount. The deposit dialogs read this 0n as
        // "clear the other field" rather than showing a zero.
        it('returns 0n when the price sits exactly on the upper bound', () => {
            expect(
                computeDependentAmount({
                    ...inRange,
                    sqrtPriceX96: SQRT_PRICE_AT_UPPER,
                    amount: 10n ** 18n,
                    side: 'token0',
                })
            ).toBe(0n)
        })

        it('returns 0n when the price sits exactly on the lower bound', () => {
            expect(
                computeDependentAmount({
                    ...inRange,
                    sqrtPriceX96: SQRT_PRICE_AT_LOWER,
                    amount: 10n ** 18n,
                    side: 'token1',
                })
            ).toBe(0n)
        })

        it('returns 0n for an empty deposit', () => {
            expect(computeDependentAmount({ ...inRange, amount: 0n, side: 'token0' })).toBe(0n)
        })

        // invert says the caller's pair is reversed relative to pool order. Mirroring the ticks and
        // flipping the side by hand has to land on the same number, or a reversed pair would quote
        // the wrong side of the book.
        it('mirrors the range and flips the side when the pair is inverted', () => {
            const inverted = computeDependentAmount({
                sqrtPriceX96: SQRT_PRICE_AT_TICK_0,
                tickLower: -TICK_UPPER,
                tickUpper: -TICK_LOWER,
                amount: 10n ** 18n,
                side: 'token1',
                invert: true,
            })
            expect(inverted).toBe(
                computeDependentAmount({ ...inRange, amount: 10n ** 18n, side: 'token0' })
            )
        })
    })
})
