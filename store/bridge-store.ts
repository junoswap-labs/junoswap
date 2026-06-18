import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Token } from '@/types/tokens'
import type { BridgeSettings, BridgeState } from '@/types/bridge'
import type { Route } from '@lifi/types'

interface BridgeStore extends BridgeState {
    settings: BridgeSettings

    setFromChainId: (chainId: number) => void
    setToChainId: (chainId: number) => void
    setFromToken: (token: Token | null) => void
    setToToken: (token: Token | null) => void
    setAmountIn: (amount: string) => void
    setQuote: (quote: Route | null) => void
    setIsLoading: (loading: boolean) => void
    setError: (error: string | null) => void
    setSlippage: (slippage: number) => void
    swapDirection: () => void
    reset: () => void
}

const defaultSettings: BridgeSettings = {
    slippage: 0.03, // 3%
}

const initialState: BridgeState = {
    fromChainId: 56, // BSC
    toChainId: 8453, // Base
    fromToken: null,
    toToken: null,
    amountIn: '',
    quote: null,
    isLoading: false,
    error: null,
}

export const useBridgeStore = create<BridgeStore>()(
    devtools(
        persist(
            (set, _get) => ({
                ...initialState,
                settings: defaultSettings,

                // Can't bridge a chain to itself: if the new chain collides with
                // the opposite side, null that side's token to force a re-pick.
                setFromChainId: (chainId) =>
                    set((state) => ({
                        fromChainId: chainId,
                        fromToken: null,
                        toToken: state.toChainId === chainId ? null : state.toToken,
                        quote: null,
                    })),

                setToChainId: (chainId) =>
                    set((state) => ({
                        toChainId: chainId,
                        toToken: null,
                        fromToken: state.fromChainId === chainId ? null : state.fromToken,
                        quote: null,
                    })),

                setFromToken: (token) => set({ fromToken: token, quote: null }),

                setToToken: (token) => set({ toToken: token, quote: null }),

                setAmountIn: (amount) => set({ amountIn: amount, quote: null }),

                setQuote: (quote) => set({ quote }),

                setIsLoading: (loading) => set({ isLoading: loading }),

                setError: (error) => set({ error }),

                setSlippage: (slippage) =>
                    set((state) => ({
                        settings: { ...state.settings, slippage },
                    })),

                swapDirection: () =>
                    set((state) => ({
                        fromChainId: state.toChainId,
                        toChainId: state.fromChainId,
                        fromToken: state.toToken,
                        toToken: state.fromToken,
                        amountIn: '',
                        quote: null,
                    })),

                reset: () => set(initialState),
            }),
            {
                name: 'junoswap-bridge-store',
                partialize: (state) => ({
                    settings: state.settings,
                }),
                merge: (persistedState, currentState) => {
                    const persisted = persistedState as Partial<BridgeStore>
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
        { name: 'junoswap-bridge' }
    )
)
