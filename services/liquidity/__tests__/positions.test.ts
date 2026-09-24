import { describe, it, expect } from 'vitest'
import type { Address } from 'viem'
import {
    buildPositionPoolKeys,
    foldPositions,
    type PoolState,
    type PositionInput,
} from '@/services/liquidity/positions'

const TOKEN0 = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa'
const TOKEN1 = '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb'
const POOL = '0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc' as Address
const POOL_KEY = `${TOKEN0.toLowerCase()}-${TOKEN1.toLowerCase()}-3000`
const SQRT_PRICE_AT_TICK_0 = 79228162514264337593543950336n

function position(overrides: Partial<PositionInput> = {}): PositionInput {
    return {
        tokenId: 1n,
        owner: '0x1111111111111111111111111111111111111111',
        token0: TOKEN0,
        token1: TOKEN1,
        fee: 3000,
        tickLower: -1000,
        tickUpper: 1000,
        liquidity: 10n ** 18n,
        tokensOwed0: 7n,
        tokensOwed1: 9n,
        ...overrides,
    }
}

const stateAtTick0: PoolState = { sqrtPriceX96: SQRT_PRICE_AT_TICK_0, tick: 0, liquidity: 42n }

function fold(
    positions: PositionInput[],
    extra: Partial<Parameters<typeof foldPositions>[0]> = {}
) {
    return foldPositions({
        positions,
        poolAddresses: new Map([[POOL_KEY, POOL]]),
        // Pool states are keyed by lowercased address, while getPool returns checksummed ones.
        poolStates: new Map([[POOL.toLowerCase(), stateAtTick0]]),
        ...extra,
    })
}

describe('services/liquidity/positions', () => {
    describe('buildPositionPoolKeys', () => {
        it('reads each pool once however many positions sit in it', () => {
            const keys = buildPositionPoolKeys([
                position({ tokenId: 1n }),
                position({ tokenId: 2n, token0: TOKEN0.toLowerCase() }),
                position({ tokenId: 3n, fee: 500 }),
            ])
            expect(keys.map((k) => k.key)).toEqual([
                POOL_KEY,
                `${TOKEN0.toLowerCase()}-${TOKEN1.toLowerCase()}-500`,
            ])
        })
    })

    describe('foldPositions', () => {
        it('values an in-range position from the live pool state', () => {
            const [described] = fold([position()])
            expect(described!.poolAddress).toBe(POOL)
            expect(described!.inRange).toBe(true)
            expect(described!.currentTick).toBe(0)
            expect(described!.poolLiquidity).toBe(42n)
            expect(described!.amount0).toBeGreaterThan(0n)
            expect(described!.amount1).toBeGreaterThan(0n)
            expect(described!.currentPrice).toBeCloseTo(1, 10)
        })

        it('marks a position out of range when the pool tick sits on its upper bound', () => {
            const [described] = fold([position({ tickLower: -2000, tickUpper: 0 })])
            expect(described!.inRange).toBe(false)
            expect(described!.amount0).toBe(0n)
            expect(described!.amount1).toBeGreaterThan(0n)
        })

        it('keeps a position whose pool could not be read, valued at zero', () => {
            const [described] = foldPositions({
                positions: [position()],
                poolAddresses: new Map(),
                poolStates: new Map(),
            })
            expect(described!.poolAddress).toBe('0x0000000000000000000000000000000000000000')
            expect(described!.inRange).toBe(false)
            expect(described!.amount0).toBe(0n)
            expect(described!.amount1).toBe(0n)
            expect(described!.currentPrice).toBe(0)
            expect(described!.priceLower).toBeGreaterThan(0)
        })

        it('prefers simulated collect() fees and falls back to tokensOwed', () => {
            const [simulated, owed] = fold([position({ tokenId: 1n }), position({ tokenId: 2n })], {
                fees: new Map([['1', { fees0: 100n, fees1: 200n }]]),
            })
            expect([simulated!.uncollectedFees0, simulated!.uncollectedFees1]).toEqual([100n, 200n])
            expect([owed!.uncollectedFees0, owed!.uncollectedFees1]).toEqual([7n, 9n])
        })

        it('scales prices by token decimals, treating unknown tokens as 18', () => {
            const [described] = fold([position()], {
                decimals: new Map([[TOKEN0.toLowerCase(), 6]]),
            })
            // A 1:1 raw price between a 6- and an 18-decimal token is 1e-12 in whole units.
            expect(described!.currentPrice).toBeCloseTo(1e-12, 20)
        })
    })
})
