'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { ponderRequest } from '@/lib/ponder-client'
import {
    aggregateCandlesticks,
    aggregateV3Candlesticks,
    stitchCandlesticks,
} from '@/services/chart'
import type { V3SwapEvent } from '@/services/chart'
import type { Timeframe, ChartMode } from '@/types/chart'

// Page through the full event history: Ponder caps a list response at 50 items
// without an explicit limit, which would truncate the chart to a token's first
// 50 swaps and forward-fill a flat line for the rest of its life.
const PAGE_SIZE = 1000

const TOKEN_PRICE_HISTORY_QUERY = `
  query TokenPriceHistory($tokenAddr: String!, $after: String) {
    swapEvents(where: { tokenAddr: $tokenAddr }, orderBy: "timestamp", orderDirection: "asc", limit: ${PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
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
  query V3SwapEvents($tokenAddr: String!, $chainId: Int!, $after: String) {
    v3SwapEvents(where: { tokenAddr: $tokenAddr, chainId: $chainId }, orderBy: "timestamp", orderDirection: "asc", limit: ${PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
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

interface PageInfo {
    hasNextPage: boolean
    endCursor: string | null
}

interface PriceHistoryResponse {
    swapEvents: {
        pageInfo: PageInfo
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
        pageInfo: PageInfo
        items: Array<{
            timestamp: number
            amount0: string
            amount1: string
            sqrtPriceX96: string
            tick: number
        }>
    }
}

// Walk every page via opaque cursor; the cursor must be pageInfo.endCursor (a raw
// row id is rejected server-side).
async function fetchAllPages<TResponse, TItem>(
    query: string,
    variables: Record<string, unknown>,
    select: (r: TResponse) => { pageInfo: PageInfo; items: TItem[] }
): Promise<TItem[]> {
    const items: TItem[] = []
    let after: string | null = null
    for (;;) {
        const result = await ponderRequest<TResponse>(query, { ...variables, after })
        const conn = select(result)
        items.push(...conn.items)
        if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break
        after = conn.pageInfo.endCursor
    }
    return items
}

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d']

export function useTokenPriceHistory(
    tokenAddr: Address | undefined,
    isGraduated?: boolean,
    graduatedAt?: number | null
) {
    const [timeframe, setTimeframe] = useState<Timeframe>('15m')
    const [chartMode, setChartMode] = useState<ChartMode>('mcap')
    const chainId = useLaunchpadChainId()
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative

    const tokenIsToken0 = tokenAddr
        ? tokenAddr.toLowerCase() < (wrappedNative?.toLowerCase() ?? '')
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

            const items = await fetchAllPages<
                PriceHistoryResponse,
                PriceHistoryResponse['swapEvents']['items'][number]
            >(
                TOKEN_PRICE_HISTORY_QUERY,
                { tokenAddr: tokenAddr.toLowerCase() },
                (r) => r.swapEvents
            )

            return items.map((e) => ({
                timestamp: e.timestamp,
                isBuy: e.isBuy === 1,
                amountIn: BigInt(e.amountIn),
                amountOut: BigInt(e.amountOut),
                reserveIn: BigInt(e.reserveIn),
                reserveOut: BigInt(e.reserveOut),
            }))
        },
        enabled: !!tokenAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    // V3 events (only fetched when graduated)
    const { data: rawV3Events, isLoading: isLoadingV3 } = useQuery({
        queryKey: ['token-v3-price-history', tokenAddr?.toLowerCase(), chainId],
        queryFn: async () => {
            if (!tokenAddr) return []

            try {
                const items = await fetchAllPages<
                    V3PriceHistoryResponse,
                    V3PriceHistoryResponse['v3SwapEvents']['items'][number]
                >(
                    V3_SWAP_EVENTS_QUERY,
                    {
                        tokenAddr: tokenAddr.toLowerCase(),
                        chainId,
                    },
                    (r) => r.v3SwapEvents
                )

                return items.map((e) => ({
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
