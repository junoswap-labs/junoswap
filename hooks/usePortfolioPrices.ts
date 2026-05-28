'use client'

import { useMemo } from 'react'
import { useTokenPrices } from '@/hooks/use-token-prices'
import type { Token } from '@/types/tokens'
import type { TokenHolding } from '@/hooks/use-multi-balances'
import type { TokenType } from '@/types/portfolio'

export function usePortfolioPrices(
    holdings: Map<string, TokenHolding>,
    nativeUsdPrice: number | null,
    chainId: number,
    getTokenType: (token: Token) => TokenType
) {
    const heldTokens = useMemo(() => {
        const tokens: Token[] = []
        for (const [, holding] of holdings) {
            tokens.push(holding.token)
        }
        return tokens
    }, [holdings])

    const allPrices = useTokenPrices(heldTokens, chainId, nativeUsdPrice, getTokenType)

    return useMemo(() => {
        const priceMap = new Map<string, number | null>()
        for (const [key] of holdings) {
            priceMap.set(key, allPrices.get(key) ?? null)
        }
        return priceMap
    }, [holdings, allPrices])
}
