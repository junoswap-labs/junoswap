import { describe, it, expect, beforeEach } from 'vitest'
import { useSwapStore } from '@/store/swap-store'
import type { Token } from '@/types/tokens'
import type { QuoteResult } from '@/types/swap'
import { ProtocolType } from '@/lib/dex-config'

const mockToken: Token = {
    address: '0xToken1234567890abcdef1234567890abcdef12' as `0x${string}`,
    symbol: 'TKN',
    name: 'Token',
    decimals: 18,
    chainId: 96,
}

const mockToken2: Token = {
    address: '0xToken21234567890abcdef1234567890abcdef1' as `0x${string}`,
    symbol: 'TKN2',
    name: 'Token 2',
    decimals: 18,
    chainId: 96,
}

const mockQuote: QuoteResult = {
    amountOut: 1000n,
    sqrtPriceX96After: 0n,
    initializedTicksCrossed: 0,
    gasEstimate: 100000n,
}

describe('swap-store', () => {
    beforeEach(() => {
        useSwapStore.getState().reset()
    })

    describe('swapTokens', () => {
        it('reverses tokens and amounts, clears quote', () => {
            useSwapStore.getState().setTokenIn(mockToken)
            useSwapStore.getState().setTokenOut(mockToken2)
            useSwapStore.getState().setAmountIn('1.5')
            useSwapStore.getState().setAmountOut('100')
            useSwapStore.getState().setQuote(mockQuote)

            useSwapStore.getState().swapTokens()

            expect(useSwapStore.getState().tokenIn).toBe(mockToken2)
            expect(useSwapStore.getState().tokenOut).toBe(mockToken)
            expect(useSwapStore.getState().amountIn).toBe('100')
            expect(useSwapStore.getState().amountOut).toBe('1.5')
            expect(useSwapStore.getState().quote).toBeNull()
        })
    })

    describe('setSlippage', () => {
        it('updates slippage and auto-detects preset', () => {
            useSwapStore.getState().setSlippage(0.1)
            expect(useSwapStore.getState().settings.slippage).toBe(0.1)
            expect(useSwapStore.getState().settings.slippagePreset).toBe('0.1')

            useSwapStore.getState().setSlippage(0.5)
            expect(useSwapStore.getState().settings.slippagePreset).toBe('0.5')

            useSwapStore.getState().setSlippage(1)
            expect(useSwapStore.getState().settings.slippagePreset).toBe('1')
        })

        it('sets preset to custom for non-standard values', () => {
            useSwapStore.getState().setSlippage(0.37)
            expect(useSwapStore.getState().settings.slippagePreset).toBe('custom')
        })
    })

    describe('setDexQuotes / clearDexQuotes', () => {
        it('sets and clears multi-DEX quotes', () => {
            const quotes = {
                junoswap: {
                    dexId: 'junoswap' as const,
                    quote: null,
                    isLoading: false,
                    isError: false,
                    error: null,
                    protocolType: ProtocolType.V3,
                },
            }
            useSwapStore.getState().setDexQuotes(quotes)
            expect(useSwapStore.getState().dexQuotes).toEqual(quotes)
            useSwapStore.getState().setBestQuoteDex('junoswap')
            expect(useSwapStore.getState().bestQuoteDex).toBe('junoswap')
            useSwapStore.getState().clearDexQuotes()
            expect(useSwapStore.getState().dexQuotes).toEqual({})
            expect(useSwapStore.getState().bestQuoteDex).toBeNull()
        })
    })
})
