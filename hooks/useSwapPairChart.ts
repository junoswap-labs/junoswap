'use client'

import { useMemo, useState } from 'react'
import { useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import {
    fetchNativeUsdPriceSnapshots,
    fetchTokenCandles,
    fetchV3History,
} from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { Timeframe, CandlestickData } from '@/types/chart'
import { TIMEFRAME_DURATIONS } from '@/types/chart'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isNativeToken } from '@/lib/wagmi'
import { ponderClient } from '@/lib/ponder-client'
import { classifySwapPair } from '@/lib/swap-chart'
import {
    aggregatePricePoints,
    sanitizeCandles,
    buildContinuousSeries,
    aggregateV3Candlesticks,
    ratioCandles,
} from '@/services/launchpad/chart'

const NATIVE_DECIMALS = 18
const MAX_CANDLES = 500

export interface SwapPairChart {
    candles: CandlestickData[]
    isLoading: boolean
    isUnsupported: boolean
    timeframe: Timeframe
    setTimeframe: (tf: Timeframe) => void
    baseSymbol: string
    quoteSymbol: string
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

function useNativeCandles(
    tokenAddr: string | undefined,
    tokenDecimals: number,
    wrappedNative: string | undefined,
    timeframe: Timeframe,
    enabled: boolean
) {
    const chainId = useChainId()
    const duration = TIMEFRAME_DURATIONS[timeframe]

    return useQuery({
        queryKey: ['token-native-candles', chainId, tokenAddr?.toLowerCase(), timeframe],
        queryFn: async (): Promise<CandlestickData[]> => {
            const addr = tokenAddr!.toLowerCase()
            const since = Math.floor(Date.now() / 1000) - MAX_CANDLES * duration

            const rows = await fetchTokenCandles(ponderClient, {
                tokenAddr: addr,
                chainId,
                source: 'v3',
                duration,
                since,
            }).catch(() => [])

            if (rows.length > 0) {
                return rows.map((r) => ({
                    time: r.bucketTs,
                    open: r.open,
                    high: r.high,
                    low: r.low,
                    close: r.close,
                    volume: 0,
                }))
            }

            const events = await fetchV3History(ponderClient, { tokenAddr: addr, chainId }).catch(
                () => []
            )
            const tokenIsToken0 = addr < (wrappedNative?.toLowerCase() ?? '')
            const raw = aggregateV3Candlesticks(events, timeframe, 'price', tokenIsToken0)
            const factor = 10 ** (tokenDecimals - NATIVE_DECIMALS)
            return factor === 1
                ? raw
                : raw.map((c) => ({
                      ...c,
                      open: c.open * factor,
                      high: c.high * factor,
                      low: c.low * factor,
                      close: c.close * factor,
                  }))
        },
        enabled: enabled && !!tokenAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })
}

export function useSwapPairChart(
    tokenIn: Token | null | undefined,
    tokenOut: Token | null | undefined
): SwapPairChart {
    const chainId = useChainId()
    const [timeframe, setTimeframe] = useState<Timeframe>('1d')
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
        queryFn: () => fetchNativeUsdPriceSnapshots(ponderClient, { chainId }).catch(() => []),
        enabled: isNativeStable,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const { data: baseCandles, isLoading: loadingBase } = useNativeCandles(
        baseAddr,
        baseToken?.decimals ?? 18,
        wrappedNative,
        timeframe,
        isRatioKind && !!baseAddr
    )

    const { data: quoteCandles, isLoading: loadingQuote } = useNativeCandles(
        quoteAddr,
        quoteToken?.decimals ?? 18,
        wrappedNative,
        timeframe,
        quoteNeedsV3
    )

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
        if (isRatioKind && baseAddr) {
            const npBase = buildContinuousSeries(sanitizeCandles(baseCandles ?? []), timeframe)
            if (quoteIsNative) return npBase
            if (!quoteAddr) return []
            const npQuote = buildContinuousSeries(sanitizeCandles(quoteCandles ?? []), timeframe)
            return buildContinuousSeries(sanitizeCandles(ratioCandles(npBase, npQuote)), timeframe)
        }
        return []
    }, [
        isNativeStable,
        isRatioKind,
        snapshotRows,
        baseCandles,
        quoteCandles,
        timeframe,
        baseAddr,
        quoteAddr,
        quoteIsNative,
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
