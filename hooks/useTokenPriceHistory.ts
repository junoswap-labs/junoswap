'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { fetchTokenSwapEventsRpc } from '@/lib/rpc/launchpad-queries'
import { aggregateCandlesticks } from '@/services/chart'
import type { Timeframe, ChartMode } from '@/types/chart'

const TOKEN_PRICE_HISTORY_QUERY = `
  query TokenPriceHistory($tokenAddr: String!) {
    swapEvents(where: { tokenAddr: $tokenAddr }, orderBy: "timestamp", orderDirection: "asc") {
      items {
        timestamp
        isBuy
        amountIn
        amountOut
        reserveIn
        reserveOut
      }
    }
  }
`

interface PriceHistoryResponse {
    swapEvents: {
        items: Array<{
            timestamp: number
            isBuy: number
            amountIn: string
            amountOut: string
            reserveIn: string
            reserveOut: string
        }>
    }
}

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d']

export function useTokenPriceHistory(tokenAddr: Address | undefined) {
    const [timeframe, setTimeframe] = useState<Timeframe>('15m')
    const [chartMode, setChartMode] = useState<ChartMode>('mcap')
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    const {
        data: rawEvents,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ['token-price-history', tokenAddr?.toLowerCase()],
        queryFn: async () => {
            if (!tokenAddr) return []

            try {
                const result = await ponderRequest<PriceHistoryResponse>(
                    TOKEN_PRICE_HISTORY_QUERY,
                    {
                        tokenAddr: tokenAddr.toLowerCase(),
                    }
                )

                return result.swapEvents.items.map((e) => ({
                    timestamp: e.timestamp,
                    isBuy: e.isBuy === 1,
                    amountIn: BigInt(e.amountIn),
                    amountOut: BigInt(e.amountOut),
                    reserveIn: BigInt(e.reserveIn),
                    reserveOut: BigInt(e.reserveOut),
                }))
            } catch (e) {
                if (!isPonderError(e) || !publicClient) throw e
                const events = await fetchTokenSwapEventsRpc(publicClient, tokenAddr)
                return events.map((e) => ({
                    timestamp: e.timestamp,
                    isBuy: e.isBuy,
                    amountIn: e.amountIn,
                    amountOut: e.amountOut,
                    reserveIn: e.reserveIn,
                    reserveOut: e.reserveOut,
                }))
            }
        },
        enabled: !!tokenAddr && !!publicClient,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const data = aggregateCandlesticks(rawEvents ?? [], timeframe, chartMode)

    return { data, isLoading, timeframe, setTimeframe, chartMode, setChartMode, refetch }
}
