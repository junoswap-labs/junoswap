import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Token } from '@/types/tokens'
import type { SwapSettings, SwapState, QuoteResult, DexQuote } from '@/types/swap'
import type { DEXType } from '@/types/dex'

interface SwapStore extends SwapState {
    settings: SwapSettings
    selectedDex: DEXType
    dexQuotes: Record<DEXType, DexQuote>
    bestQuoteDex: DEXType | null
    isUpdatingFromUrl: boolean

    setTokenIn: (token: Token | null) => void
    setTokenOut: (token: Token | null) => void
    setSelectedDex: (dex: DEXType) => void
    setAmountIn: (amount: string) => void
    setAmountOut: (amount: string) => void
    setQuote: (quote: QuoteResult | null) => void
    setIsLoading: (loading: boolean) => void
    setError: (error: string | null) => void
    setSlippage: (slippage: number) => void
    setSlippagePreset: (preset: '0.1' | '0.5' | '1' | 'custom') => void
    setDeadlineMinutes: (minutes: number) => void
    setExpertMode: (enabled: boolean) => void
    setAutoSelectBestDex: (enabled: boolean) => void
    setShowChart: (enabled: boolean) => void
    setIsUpdatingFromUrl: (updating: boolean) => void
    setDexQuotes: (quotes: Record<DEXType, DexQuote>) => void
    setBestQuoteDex: (dexId: DEXType | null) => void
    clearDexQuotes: () => void
    swapTokens: () => void
    reset: () => void
}

const defaultSettings: SwapSettings = {
    slippage: 0.5,
    slippagePreset: '0.5',
    deadlineMinutes: 20,
    expertMode: false,
    autoSelectBestDex: true,
    showChart: false,
}

const initialState: SwapState = {
    tokenIn: null,
    tokenOut: null,
    amountIn: '',
    amountOut: '',
    quote: null,
    isLoading: false,
    error: null,
    isUpdatingFromUrl: false,
}

export const useSwapStore = create<SwapStore>()(
    devtools(
        persist(
            (set, _get) => ({
                ...initialState,
                settings: defaultSettings,
                selectedDex: 'junoswap',
                dexQuotes: {},
                bestQuoteDex: null,

                setTokenIn: (token) => set({ tokenIn: token }),

                setTokenOut: (token) => set({ tokenOut: token }),

                setSelectedDex: (dex) => set({ selectedDex: dex }),

                setAmountIn: (amount) => set({ amountIn: amount }),

                setAmountOut: (amount) => set({ amountOut: amount }),

                setQuote: (quote) => set({ quote }),

                setIsLoading: (loading) => set({ isLoading: loading }),

                setError: (error) => set({ error }),

                setSlippage: (slippage) =>
                    set((state) => ({
                        settings: {
                            ...state.settings,
                            slippage,
                            slippagePreset: ['0.1', '0.5', '1'].includes(slippage.toString())
                                ? (slippage.toString() as '0.1' | '0.5' | '1')
                                : 'custom',
                        },
                    })),

                setSlippagePreset: (preset) =>
                    set((state) => ({
                        settings: {
                            ...state.settings,
                            slippagePreset: preset,
                            slippage:
                                preset === 'custom' ? state.settings.slippage : parseFloat(preset),
                        },
                    })),

                setDeadlineMinutes: (minutes) =>
                    set((state) => ({
                        settings: {
                            ...state.settings,
                            deadlineMinutes: minutes,
                        },
                    })),

                setExpertMode: (enabled) =>
                    set((state) => ({
                        settings: {
                            ...state.settings,
                            expertMode: enabled,
                        },
                    })),

                setAutoSelectBestDex: (enabled) =>
                    set((state) => ({
                        settings: {
                            ...state.settings,
                            autoSelectBestDex: enabled,
                        },
                    })),

                setShowChart: (enabled) =>
                    set((state) => ({
                        settings: {
                            ...state.settings,
                            showChart: enabled,
                        },
                    })),

                swapTokens: () =>
                    set((state) => ({
                        tokenIn: state.tokenOut,
                        tokenOut: state.tokenIn,
                        amountIn: state.amountOut,
                        amountOut: state.amountIn,
                        quote: null,
                    })),

                setIsUpdatingFromUrl: (updating) => set({ isUpdatingFromUrl: updating }),

                setDexQuotes: (quotes) => set({ dexQuotes: quotes }),
                setBestQuoteDex: (dexId) => set({ bestQuoteDex: dexId }),
                clearDexQuotes: () => set({ dexQuotes: {}, bestQuoteDex: null }),

                reset: () => set(initialState),
            }),
            {
                name: 'junoswap-swap-store',
                partialize: (state) => ({
                    settings: state.settings,
                }),
                // Merge persisted settings over defaults so newly-added setting fields are populated
                merge: (persistedState, currentState) => {
                    const persisted = persistedState as Partial<SwapStore>
                    return {
                        ...currentState,
                        settings: {
                            ...defaultSettings,
                            ...persisted.settings,
                        },
                    }
                },
            }
        ),
        { name: 'junoswap-swap' }
    )
)
