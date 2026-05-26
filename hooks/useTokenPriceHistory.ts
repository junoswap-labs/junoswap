'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { fetchTokenSwapEventsRpc } from '@/lib/rpc/launchpad-queries'
import {
    aggregateCandlesticks,
    aggregateV3Candlesticks,
    stitchCandlesticks,
} from '@/services/chart'
import type { V3SwapEvent } from '@/services/chart'
import type { Timeframe, ChartMode } from '@/types/chart'

const WRAPPED_NATIVE = INTERMEDIARY_TOKENS[PUMP_CORE_NATIVE_CHAIN_ID]?.wrappedNative

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

const V3_SWAP_EVENTS_QUERY = `
  query V3SwapEvents($tokenAddr: String!) {
    v3SwapEvents(where: { tokenAddr: $tokenAddr }, orderBy: "timestamp", orderDirection: "asc") {
      items {
        timestamp
        amount0
        amount1
        sqrtPriceX96
        tick
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

interface V3PriceHistoryResponse {
    v3SwapEvents: {
        items: Array<{
            timestamp: number
            amount0: string
            amount1: string
            sqrtPriceX96: string
            tick: number
        }>
    }
}

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d']

export function useTokenPriceHistory(
    tokenAddr: Address | undefined,
    isGraduated?: boolean,
    graduatedAt?: number | null
) {
    const [timeframe, setTimeframe] = useState<Timeframe>('15m')
    const [chartMode, setChartMode] = useState<ChartMode>('mcap')
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    const tokenIsToken0 = tokenAddr
        ? tokenAddr.toLowerCase() < (WRAPPED_NATIVE?.toLowerCase() ?? '')
        : false

    // Bonding curve events (always fetched)
    const {
        data: rawEvents,
        isLoading: isLoadingBc,
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

    // V3 events (only fetched when graduated)
    const { data: rawV3Events, isLoading: isLoadingV3 } = useQuery({
        queryKey: ['token-v3-price-history', tokenAddr?.toLowerCase()],
        queryFn: async () => {
            if (!tokenAddr) return []

            try {
                const result = await ponderRequest<V3PriceHistoryResponse>(V3_SWAP_EVENTS_QUERY, {
                    tokenAddr: tokenAddr.toLowerCase(),
                })

                return result.v3SwapEvents.items.map((e) => ({
                    timestamp: e.timestamp,
                    amount0: e.amount0,
                    amount1: e.amount1,
                    sqrtPriceX96: e.sqrtPriceX96,
                    tick: e.tick,
                }))
            } catch {
                return []
            }
        },
        enabled: !!tokenAddr && !!isGraduated,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const data = useMemo(() => {
        const bcCandles = aggregateCandlesticks(rawEvents ?? [], timeframe, chartMode)

        if (isGraduated) {
            const v3Candles = aggregateV3Candlesticks(
                (rawV3Events ?? []) as V3SwapEvent[],
                timeframe,
                chartMode,
                tokenIsToken0
            )
            return stitchCandlesticks(bcCandles, v3Candles, graduatedAt ?? null)
        }

        return bcCandles
    }, [rawEvents, rawV3Events, timeframe, chartMode, isGraduated, tokenIsToken0, graduatedAt])

    return {
        data,
        isLoading: isLoadingBc || (isGraduated && isLoadingV3),
        timeframe,
        setTimeframe,
        chartMode,
        setChartMode,
        refetch,
    }
}
