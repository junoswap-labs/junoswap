'use client'

import { useMemo } from 'react'
import { useChainId } from 'wagmi'
import { parseEther } from 'viem'
import { NATIVE_USD_STABLE } from '@/lib/routing-config'
import { useUniV3Quote } from '@/hooks/useUniV3Quote'
import { TOKEN_LISTS } from '@/lib/tokens'
import type { Token } from '@/types/tokens'

/**
 * Returns the USD price of 1 native token by quoting wrapped-native → USDT
 * via the V3 quoter. Returns null if no USDT is configured for the chain.
 */
export function useNativeUsdPrice(chainId?: number) {
    const currentChainId = useChainId()
    const targetChainId = chainId ?? currentChainId

    const usdtConfig = NATIVE_USD_STABLE[targetChainId]

    // Build Token objects from the token list
    const tokens = TOKEN_LISTS[targetChainId]
    const wrappedNative = useMemo<Token | null>(() => {
        if (!tokens || tokens.length < 2) return null
        return tokens[1]! // index 1 = wrapped native
    }, [tokens])

    const usdtToken = useMemo<Token | null>(() => {
        if (!usdtConfig || !tokens) return null
        return (
            tokens.find((t) => t.address.toLowerCase() === usdtConfig.address.toLowerCase()) ?? null
        )
    }, [usdtConfig, tokens])

    const { quote, isLoading } = useUniV3Quote({
        tokenIn: wrappedNative,
        tokenOut: usdtToken,
        amountIn: parseEther('1'),
        enabled: !!usdtConfig,
    })

    const nativeUsdPrice = useMemo(() => {
        if (!quote || !usdtConfig) return null
        const divisor = 10 ** usdtConfig.decimals
        return Number(quote.amountOut) / divisor
    }, [quote, usdtConfig])

    return { nativeUsdPrice, isLoading }
}
