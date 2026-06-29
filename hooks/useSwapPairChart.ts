'use client'

import { useMemo, useState } from 'react'
import { useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import type { Timeframe, CandlestickData } from '@/types/chart'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isNativeToken } from '@/lib/wagmi'
import { fetchAllPages } from '@/lib/ponder-client'
import { classifySwapPair } from '@/lib/swap-chart'
import {
    aggregatePricePoints,
    sanitizeCandles,
    buildContinuousSeries,
    tokenNativeCandles,
    ratioCandles,
} from '@/services/chart'
import type { V3SwapEvent } from '@/services/chart'

const PAGE_SIZE = 1000
// Wrapped native (KKUB/WJBC/WETH/WBNB/…) is 18 decimals on every supported chain.
const NATIVE_DECIMALS = 18

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

// Per-token native price from its Junoswap V3 swaps (token↔native pool).
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
    /** True when the pair has no indexable price series. */
    isUnsupported: boolean
    timeframe: Timeframe
    setTimeframe: (tf: Timeframe) => void
    baseSymbol: string
    quoteSymbol: string
    /** 'usd' → $ prefix (vs native/stable); 'native'/'token' → priced in the quote token. */
    denom: 'usd' | 'native' | 'token'
}

function resolveToken(
    addr: Address | undefined,
    tokenIn: Token | null | undefined,
    tokenOut: Token | null | undefined
): Token | null {
    if (!addr) return null
    const a = addr.toLowerCase()
    for (const t of [tokenIn, tokenOut]) {
        if (t && t.address.toLowerCase() === a) return t
    }
    return null
}

function fetchV3Events(tokenAddr: string, chainId: number) {
    return fetchAllPages<V3EventsResponse, V3SwapEvent>(
        V3_SWAP_EVENTS_QUERY,
        { tokenAddr: tokenAddr.toLowerCase(), chainId },
        (r) => r.v3SwapEvents
    ).catch(() => [] as V3SwapEvent[])
}

export function useSwapPairChart(
    tokenIn: Token | null | undefined,
    tokenOut: Token | null | undefined
): SwapPairChart {
    const chainId = useChainId()
    const [timeframe, setTimeframe] = useState<Timeframe>('15m')
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative

    const classification = useMemo(
        () => classifySwapPair(chainId, tokenIn?.address, tokenOut?.address),
        [chainId, tokenIn?.address, tokenOut?.address]
    )
    const { kind, baseAddr, quoteAddr } = classification

    const isNativeStable = kind === 'native-stable'
    const isRatioKind = kind === 'token-native' || kind === 'token-stable' || kind === 'token-token'
    const quoteIsNative =
        !!quoteAddr &&
        (isNativeToken(quoteAddr) || quoteAddr.toLowerCase() === wrappedNative?.toLowerCase())
    const quoteNeedsV3 = isRatioKind && !!quoteAddr && !quoteIsNative

    const baseToken = useMemo(
        () => resolveToken(baseAddr, tokenIn, tokenOut),
        [baseAddr, tokenIn, tokenOut]
    )
    const quoteToken = useMemo(
        () => resolveToken(quoteAddr, tokenIn, tokenOut),
        [quoteAddr, tokenIn, tokenOut]
    )

    const { data: snapshotRows, isLoading: loadingSnap } = useQuery({
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

    // base is always a non-native token in the ratio kinds.
    const { data: baseEvents, isLoading: loadingBase } = useQuery({
        queryKey: ['swap-pair-v3', baseAddr?.toLowerCase(), chainId],
        queryFn: () => fetchV3Events(baseAddr!, chainId),
        enabled: isRatioKind && !!baseAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const { data: quoteEvents, isLoading: loadingQuote } = useQuery({
        queryKey: ['swap-pair-v3', quoteAddr?.toLowerCase(), chainId],
        queryFn: () => fetchV3Events(quoteAddr!, chainId),
        enabled: quoteNeedsV3,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const candles = useMemo(() => {
        if (isNativeStable) {
            const points = (snapshotRows ?? []).map((r) => ({
                timestamp: r.timestamp,
                price: parseFloat(r.price),
            }))
            return buildContinuousSeries(
                sanitizeCandles(aggregatePricePoints(points, timeframe)),
                timeframe
            )
        }
        if (isRatioKind && baseAddr && wrappedNative) {
            const npBase = tokenNativeCandles(
                baseEvents ?? [],
                baseAddr,
                baseToken?.decimals ?? 18,
                wrappedNative,
                NATIVE_DECIMALS,
                timeframe
            )
            // token↔native: the quote IS native, so the base series is already the price.
            if (quoteIsNative) return npBase
            if (!quoteAddr) return []
            const npQuote = tokenNativeCandles(
                quoteEvents ?? [],
                quoteAddr,
                quoteToken?.decimals ?? 18,
                wrappedNative,
                NATIVE_DECIMALS,
                timeframe
            )
            return buildContinuousSeries(sanitizeCandles(ratioCandles(npBase, npQuote)), timeframe)
        }
        return []
    }, [
        isNativeStable,
        isRatioKind,
        snapshotRows,
        baseEvents,
        quoteEvents,
        timeframe,
        baseAddr,
        quoteAddr,
        quoteIsNative,
        wrappedNative,
        baseToken,
        quoteToken,
    ])

    const denom: 'usd' | 'native' | 'token' =
        kind === 'native-stable' || kind === 'token-stable'
            ? 'usd'
            : kind === 'token-native'
              ? 'native'
              : 'token'

    const baseSymbol = baseToken?.symbol ?? ''
    const quoteSymbol = quoteToken?.symbol ?? (kind === 'native-stable' ? 'USD' : '')

    const isLoading =
        (isNativeStable && loadingSnap) ||
        (isRatioKind && (loadingBase || (quoteNeedsV3 && loadingQuote)))

    return {
        candles,
        isLoading,
        isUnsupported: kind === 'unsupported',
        timeframe,
        setTimeframe,
        baseSymbol,
        quoteSymbol,
        denom,
    }
}
