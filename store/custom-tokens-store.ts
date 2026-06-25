import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'
import type { Token } from '@/types/tokens'

interface CustomTokensStore {
    customTokens: Token[]
    addCustomToken: (token: Token) => void
}

const sameToken = (a: Token, b: Token) =>
    a.chainId === b.chainId && a.address.toLowerCase() === b.address.toLowerCase()

// localStorage is absent during SSR and in the node test env — fall back to a
// no-op store there so persist doesn't throw on setItem.
const safeStorage = createJSONStorage(() => {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

export const useCustomTokensStore = create<CustomTokensStore>()(
    devtools(
        persist(
            (set, get) => ({
                customTokens: [],

                addCustomToken: (token) => {
                    if (get().customTokens.some((t) => sameToken(t, token))) return
                    set((state) => ({ customTokens: [...state.customTokens, token] }))
                },
            }),
            { name: 'junoswap-custom-tokens', storage: safeStorage }
        ),
        { name: 'junoswap-custom-tokens' }
    )
)
