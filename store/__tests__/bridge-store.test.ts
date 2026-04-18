import { describe, it, expect, beforeEach } from 'vitest'
import { useBridgeStore } from '@/store/bridge-store'
import type { Token } from '@/types/tokens'

const mockToken: Token = {
    address: '0xToken1234567890abcdef1234567890abcdef12' as `0x${string}`,
    symbol: 'TKN',
    name: 'Token',
    decimals: 18,
    chainId: 56,
}

const mockToken2: Token = {
    address: '0xToken21234567890abcdef1234567890abcdef1' as `0x${string}`,
    symbol: 'TKN2',
    name: 'Token 2',
    decimals: 18,
    chainId: 8453,
}

describe('bridge-store', () => {
    beforeEach(() => {
        useBridgeStore.getState().reset()
    })

    describe('setFromChainId', () => {
        it('updates chainId and clears fromToken and quote', () => {
            useBridgeStore.getState().setFromToken(mockToken)
            useBridgeStore.getState().setFromChainId(1)
            const state = useBridgeStore.getState()
            expect(state.fromChainId).toBe(1)
            expect(state.fromToken).toBeNull()
            expect(state.quote).toBeNull()
        })

        it('clears toToken when chains match', () => {
            useBridgeStore.getState().setToToken(mockToken2)
            useBridgeStore.getState().setFromChainId(8453)
            expect(useBridgeStore.getState().toToken).toBeNull()
        })
    })

    describe('setToChainId', () => {
        it('updates chainId and clears toToken and quote', () => {
            useBridgeStore.getState().setToToken(mockToken2)
            useBridgeStore.getState().setToChainId(1)
            expect(useBridgeStore.getState().toChainId).toBe(1)
            expect(useBridgeStore.getState().toToken).toBeNull()
        })

        it('clears fromToken when chains match', () => {
            useBridgeStore.getState().setFromToken(mockToken)
            useBridgeStore.getState().setToChainId(56)
            expect(useBridgeStore.getState().fromToken).toBeNull()
        })
    })

    describe('swapDirection', () => {
        it('swaps chains and tokens, clears amount and quote', () => {
            useBridgeStore.getState().setFromToken(mockToken)
            useBridgeStore.getState().setToToken(mockToken2)
            useBridgeStore.getState().setAmountIn('10')

            useBridgeStore.getState().swapDirection()

            const state = useBridgeStore.getState()
            expect(state.fromChainId).toBe(8453)
            expect(state.toChainId).toBe(56)
            expect(state.fromToken).toBe(mockToken2)
            expect(state.toToken).toBe(mockToken)
            expect(state.amountIn).toBe('')
            expect(state.quote).toBeNull()
        })
    })
})
