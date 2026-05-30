'use client'

import { useQuery } from '@tanstack/react-query'
import { formatEther } from 'viem'
import type { Address } from 'viem'
import { ponderRequest } from '@/lib/ponder-client'

const TOKEN_PRICE_QUERY = `
  query TokenPrice($tokenAddr: String!, $oneDayAgo: Int!) {
    tokenSnapshots(where: { tokenAddr: $tokenAddr }) {
      items {
        lastPrice
      }
    }
    swapEvents(
      where: { tokenAddr: $tokenAddr, timestamp_gte: $oneDayAgo }
      orderBy: "timestamp"
      orderDirection: "asc"
      limit: 1
    ) {
      items {
        isBuy
        amountIn
        amountOut
      }
    }
  }
`

interface TokenPriceResponse {
    tokenSnapshots: {
        items: Array<{
            lastPrice: string
        }>
    }
    swapEvents: {
        items: Array<{
            isBuy: number
            amountIn: string
            amountOut: string
        }>
    }
}

function calculatePrice(isBuy: boolean, amountIn: bigint, amountOut: bigint): number {
    if (amountIn === 0n || amountOut === 0n) return 0
    const inNum = parseFloat(formatEther(amountIn))
    const outNum = parseFloat(formatEther(amountOut))
    if (outNum === 0 || inNum === 0) return 0
    return isBuy ? inNum / outNum : outNum / inNum
}

interface UseTokenPriceResult {
    currentPrice: number | null
    priceChangePercent24h: number | null
    isPositive: boolean | null
    isLoading: boolean
}

export function useTokenPrice(tokenAddr: Address | undefined): UseTokenPriceResult {
    const { data, isLoading } = useQuery({
        queryKey: ['token-price', tokenAddr?.toLowerCase()],
        queryFn: async () => {
            if (!tokenAddr) return null

            const oneDayAgo = Math.floor(Date.now() / 1000) - 86400
            const result = await ponderRequest<TokenPriceResponse>(TOKEN_PRICE_QUERY, {
                tokenAddr: tokenAddr.toLowerCase(),
                oneDayAgo,
            })

            const snapshot = result.tokenSnapshots.items[0]
            if (!snapshot) return null

            const currentPrice = parseFloat(snapshot.lastPrice)
            if (currentPrice <= 0) return null

            let priceChangePercent24h: number | null = null
            let isPositive: boolean | null = null

            const pastEvent = result.swapEvents.items[0]
            if (pastEvent) {
                const pastPrice = calculatePrice(
                    pastEvent.isBuy === 1,
                    BigInt(pastEvent.amountIn),
                    BigInt(pastEvent.amountOut)
                )
                if (pastPrice > 0 && currentPrice > 0) {
                    priceChangePercent24h = ((currentPrice - pastPrice) / pastPrice) * 100
                    isPositive = priceChangePercent24h >= 0
                }
            }

            return { currentPrice, priceChangePercent24h, isPositive }
        },
        enabled: !!tokenAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    return {
        currentPrice: data?.currentPrice ?? null,
        priceChangePercent24h: data?.priceChangePercent24h ?? null,
        isPositive: data?.isPositive ?? null,
        isLoading,
    }
}
