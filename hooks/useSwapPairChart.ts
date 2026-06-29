'use client'

import { useMemo, useState } from 'react'
import { useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Token } from '@/types/tokens'
import type { Timeframe, CandlestickData } from '@/types/chart'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isNativeToken } from '@/lib/wagmi'
import { fetchAllPages } from '@/lib/ponder-client'
import { classifySwapPair } from '@/lib/swap-chart'
import {
    aggregatePricePoints,
    aggregateV3Candlesticks,
    sanitizeCandles,
    buildContinuousSeries,
} from '@/services/chart'
import type { V3SwapEvent } from '@/services/chart'

const PAGE_SIZE = 1000

// native↔stable: the indexed native→USD price history is exactly the native/stable
// (e.g. KKUB/KUSDT) price. Populated per native/stable V3 swap, so it avoids the
// historical eth_call reads that fail on kub's non-archive RPC.
const NATIVE_USD_SNAPSHOTS_QUERY = `
  query SwapPairNativeUsd($chainId: Int!, $after: String) {
    nativeUsdPriceSnapshots(where: { chainId: $chainId }, orderBy: "timestamp", orderDirection: "asc", limit: ${PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      items { timestamp price }
    }
  }
`

// token↔native: price the non-native token in native from its V3 swap events.
const V3_SWAP_EVENTS_QUERY = `
  query SwapPairV3Events($tokenAddr: String!, $chainId: Int!, $after: String) {
    v3SwapEvents(where: { tokenAddr: $tokenAddr, chainId: $chainId }, orderBy: "timestamp", orderDirection: "asc", limit: ${PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      items { timestamp amount0 amount1 sqrtPriceX96 tick }
    }
  }
`

interface PonderPage<TItem> {
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    items: TItem[]
}

interface SnapshotsResponse {
    nativeUsdPriceSnapshots: PonderPage<{ timestamp: number; price: string }>
}

interface V3EventsResponse {
    v3SwapEvents: PonderPage<V3SwapEvent>
}

export interface SwapPairChart {
    candles: CandlestickData[]
    isLoading: boolean
    /** True when the pair has no indexable price series (token/token, etc.). */
    isUnsupported: boolean
    timeframe: Timeframe
    setTimeframe: (tf: Timeframe) => void
    baseSymbol: string
    quoteSymbol: string
    /** 'usd' → native/stable price (prefix $); 'native' → token priced in native. */
    denom: 'usd' | 'native'
}

export function useSwapPairChart(
    tokenIn: Token | null | undefined,
    tokenOut: Token | null | undefined
): SwapPairChart {
    const chainId = useChainId()
    const [timeframe, setTimeframe] = useState<Timeframe>('15m')

    const classification = useMemo(
        () => classifySwapPair(chainId, tokenIn?.address, tokenOut?.address),
        [chainId, tokenIn?.address, tokenOut?.address]
    )

    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative

    const isNativeStable = classification.kind === 'native-stable'
    const v3TokenAddr =
        classification.kind === 'token-native' ? classification.tokenAddr : undefined

    const { data: snapshotRows, isLoading: isLoadingSnapshots } = useQuery({
        queryKey: ['swap-pair-native-usd', chainId],
        queryFn: () =>
            fetchAllPages<SnapshotsResponse, { timestamp: number; price: string }>(
                NATIVE_USD_SNAPSHOTS_QUERY,
                { chainId },
                (r) => r.nativeUsdPriceSnapshots
            ).catch(() => []),
        enabled: isNativeStable,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const { data: v3Events, isLoading: isLoadingV3 } = useQuery({
        queryKey: ['swap-pair-v3', v3TokenAddr?.toLowerCase(), chainId],
        queryFn: () =>
            fetchAllPages<V3EventsResponse, V3SwapEvent>(
                V3_SWAP_EVENTS_QUERY,
                { tokenAddr: v3TokenAddr!.toLowerCase(), chainId },
                (r) => r.v3SwapEvents
            ).catch(() => []),
        enabled: !!v3TokenAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const { nativeSideToken, otherSideToken } = useMemo(() => {
        const inNativeSide =
            !!tokenIn &&
            (isNativeToken(tokenIn.address) ||
                tokenIn.address.toLowerCase() === wrappedNative?.toLowerCase())
        return {
            nativeSideToken: inNativeSide ? tokenIn : tokenOut,
            otherSideToken: inNativeSide ? tokenOut : tokenIn,
        }
    }, [tokenIn, tokenOut, wrappedNative])

    const candles = useMemo(() => {
        if (classification.kind === 'native-stable') {
            const points = (snapshotRows ?? []).map((r) => ({
                timestamp: r.timestamp,
                price: parseFloat(r.price),
            }))
            return buildContinuousSeries(
                sanitizeCandles(aggregatePricePoints(points, timeframe)),
                timeframe
            )
        }
        if (classification.kind === 'token-native' && classification.tokenAddr && wrappedNative) {
            // aggregateV3Candlesticks keys on which token is token0 to read price the
            // right way up; mirror useTokenPriceHistory's lexicographic rule.
            const tokenIsToken0 =
                classification.tokenAddr.toLowerCase() < wrappedNative.toLowerCase()
            const raw = aggregateV3Candlesticks(v3Events ?? [], timeframe, 'price', tokenIsToken0)
            // The V3 price is a raw-unit ratio (native smallest-units per token
            // smallest-units); rescale to a human native-per-token price by the
            // tokens' decimals so non-18-decimal tokens aren't off by 10^n.
            const decToken = otherSideToken?.decimals ?? 18
            const decNative = nativeSideToken?.decimals ?? 18
            const factor = 10 ** (decToken - decNative)
            const scaled =
                factor === 1
                    ? raw
                    : raw.map((c) => ({
                          ...c,
                          open: c.open * factor,
                          high: c.high * factor,
                          low: c.low * factor,
                          close: c.close * factor,
                      }))
            return buildContinuousSeries(sanitizeCandles(scaled), timeframe)
        }
        return []
    }, [
        classification,
        snapshotRows,
        v3Events,
        timeframe,
        wrappedNative,
        otherSideToken,
        nativeSideToken,
    ])

    const { baseSymbol, quoteSymbol, denom } = useMemo<{
        baseSymbol: string
        quoteSymbol: string
        denom: 'usd' | 'native'
    }>(() => {
        if (classification.kind === 'native-stable') {
            return {
                baseSymbol: nativeSideToken?.symbol ?? '',
                quoteSymbol: otherSideToken?.symbol ?? 'USD',
                denom: 'usd',
            }
        }
        if (classification.kind === 'token-native') {
            return {
                baseSymbol: otherSideToken?.symbol ?? '',
                quoteSymbol: nativeSideToken?.symbol ?? '',
                denom: 'native',
            }
        }
        return { baseSymbol: '', quoteSymbol: '', denom: 'usd' }
    }, [classification.kind, nativeSideToken, otherSideToken])

    const isLoading = (isNativeStable && isLoadingSnapshots) || (!!v3TokenAddr && isLoadingV3)

    return {
        candles,
        isLoading,
        isUnsupported: classification.kind === 'unsupported',
        timeframe,
        setTimeframe,
        baseSymbol,
        quoteSymbol,
        denom,
    }
}
