'use client'

import { useChainId } from 'wagmi'
import { parseEther } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { NATIVE_USD_STABLE } from '@/lib/routing-config'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'

interface NativeUsdPriceResponse {
    nativeUsdPrices: {
        items: Array<{ chainId: number; price: string }>
    }
}

const NATIVE_USD_PRICE_QUERY = `
  query NativeUsdPrice($chainId: Int!) {
    nativeUsdPrices(where: { chainId: $chainId }, limit: 1) {
      items {
        chainId
        price
      }
    }
  }
`

export function useNativeUsdPrice(chainId?: number) {
    const currentChainId = useChainId()
    const targetChainId = chainId ?? currentChainId

    const hasStablePool =
        !!NATIVE_USD_STABLE[targetChainId] ||
        (INTERMEDIARY_TOKENS[targetChainId]?.stables?.length ?? 0) > 0

    const { data, isLoading } = useQuery({
        queryKey: ['native-usd-price', targetChainId],
        queryFn: async () => {
            try {
                const result = await ponderRequest<NativeUsdPriceResponse>(NATIVE_USD_PRICE_QUERY, {
                    chainId: targetChainId,
                })
                const item = result.nativeUsdPrices.items[0]
                return item ? parseFloat(item.price) : null
            } catch (e) {
                if (isPonderError(e)) return null
                throw e
            }
        },
        staleTime: 30_000,
        refetchInterval: 30_000,
        enabled: hasStablePool,
    })

    const nativeUsdPrice = useMemo(() => {
        if (!quote || !usdtConfig) return null
        const divisor = 10 ** usdtConfig.decimals
        return Number(quote.amountOut) / divisor
    }, [quote, usdtConfig])

    return { nativeUsdPrice, isLoading }
    return { nativeUsdPrice: data ?? null, isLoading }
}
