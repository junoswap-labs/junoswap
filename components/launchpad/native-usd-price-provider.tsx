'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useNativeUsdPrice } from '@/hooks/useNativeUsdPrice'

const NativeUsdPriceContext = createContext<{
    nativeUsdPrice: number | null
    isLoading: boolean
}>({ nativeUsdPrice: null, isLoading: false })

export function NativeUsdPriceProvider({ children }: { children: ReactNode }) {
    const { nativeUsdPrice, isLoading } = useNativeUsdPrice()

    return (
        <NativeUsdPriceContext.Provider value={{ nativeUsdPrice, isLoading }}>
            {children}
        </NativeUsdPriceContext.Provider>
    )
}

export function useNativeUsdPriceContext() {
    return useContext(NativeUsdPriceContext)
}
