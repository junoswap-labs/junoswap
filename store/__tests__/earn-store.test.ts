import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useEarnStore } from '@/store/earn-store'
import { DEFAULT_RANGE_CONFIG } from '@/types/earn'
import type { Token } from '@/types/tokens'
import type { V3PoolData } from '@/types/earn'

const mockToken0: Token = {
    address: '0xToken01234567890abcdef1234567890abcdef' as `0x${string}`,
    symbol: 'TKN0',
    name: 'Token 0',
    decimals: 18,
    chainId: 96,
}

const mockToken1: Token = {
    address: '0xToken11234567890abcdef1234567890abcdef' as `0x${string}`,
    symbol: 'TKN1',
    name: 'Token 1',
    decimals: 18,
    chainId: 96,
}

const mockPool: V3PoolData = {
    address: '0xPool1234567890abcdef1234567890abcdef12' as `0x${string}`,
    token0: mockToken0,
    token1: mockToken1,
    fee: 3000,
    liquidity: 10n ** 18n,
    sqrtPriceX96: 2n ** 96n,
    tick: 0,
    tickSpacing: 60,
}

vi.mock('@/lib/liquidity-helpers', () => ({
    getPresetRange: vi.fn((_tick: number, _spacing: number, preset: string) => {
        if (preset === 'full') return { tickLower: -887220, tickUpper: 887220 }
        if (preset === 'safe') return { tickLower: -4055, tickUpper: 4055 }
        if (preset === 'common') return { tickLower: -1800, tickUpper: 1800 }
        if (preset === 'narrow') return { tickLower: -480, tickUpper: 480 }
        return { tickLower: 0, tickUpper: 0 }
    }),
    tickToPrice: vi.fn((tick: number) => `price_at_${tick}`),
}))

describe('earn-store', () => {
    beforeEach(() => {
        useEarnStore.getState().reset()
    })

    describe('setRangePreset', () => {
        it('updates range config with ticks and prices when pool is set', () => {
            useEarnStore.getState().setSelectedPool(mockPool)
            useEarnStore.getState().setRangePreset('common', 0, 60)

            const config = useEarnStore.getState().rangeConfig
            expect(config.preset).toBe('common')
            expect(config.tickLower).toBe(-1800)
            expect(config.tickUpper).toBe(1800)
        })
    })

    describe('openAddLiquidity', () => {
        it('opens dialog with pool, auto-populating tokens and range', () => {
            useEarnStore.getState().openAddLiquidity(mockPool)
            const state = useEarnStore.getState()
            expect(state.isAddLiquidityOpen).toBe(true)
            expect(state.selectedPool).toBe(mockPool)
            expect(state.token0).toBe(mockToken0)
            expect(state.token1).toBe(mockToken1)
            expect(state.fee).toBe(3000)
            expect(state.rangeConfig.preset).toBe('common')
        })
    })

    describe('closeAddLiquidity', () => {
        it('closes dialog and clears pool/tokens', () => {
            useEarnStore.getState().openAddLiquidity(mockPool)
            useEarnStore.getState().closeAddLiquidity()

            const state = useEarnStore.getState()
            expect(state.isAddLiquidityOpen).toBe(false)
            expect(state.selectedPool).toBeNull()
            expect(state.token0).toBeNull()
            expect(state.token1).toBeNull()
            expect(state.rangeConfig).toEqual(DEFAULT_RANGE_CONFIG)
        })
    })

    describe('resetTokenSelection', () => {
        it('resets only token/fee/range state', () => {
            useEarnStore.getState().setToken0(mockToken0)
            useEarnStore.getState().setToken1(mockToken1)
            useEarnStore.getState().setFee(500)
            useEarnStore.getState().resetTokenSelection()

            expect(useEarnStore.getState().token0).toBeNull()
            expect(useEarnStore.getState().token1).toBeNull()
            expect(useEarnStore.getState().fee).toBe(3000)
            expect(useEarnStore.getState().rangeConfig).toEqual(DEFAULT_RANGE_CONFIG)
        })
    })
})
