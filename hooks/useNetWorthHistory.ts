'use client'

import { useMemo, useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
    computeNetWorthHistory,
    needsPriceHistory,
    type NetWorthPoint,
} from '@/services/portfolio/net-worth'
import { fetchTokenPriceHistory, type PricePoint } from '@/lib/price-history'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import type { UserSwapEvent } from '@/hooks/useUserSwapEvents'
import type { PortfolioToken } from '@/types/portfolio'

const EMPTY_HISTORY: NetWorthPoint[] = []
const DAY_SECONDS = 86_400

interface UseNetWorthHistoryParams {
    address: `0x${string}` | undefined
    chainId: number
    portfolioTokens: PortfolioToken[]
    swapEvents: UserSwapEvent[] | undefined
    nativeUsdPoints: PricePoint[]
    nativeUsdPrice: number | null
    netWorthNow: number
    isInputLoading: boolean
}

export function useNetWorthHistory(params: UseNetWorthHistoryParams): NetWorthPoint[] {
    const { address, chainId, portfolioTokens, swapEvents, nativeUsdPoints, nativeUsdPrice } =
        params

    const supported = isLeaderboardSupportedChain(chainId)

    const nowSec = useMemo(() => Math.floor(Date.now() / 60_000) * 60, [])
    const windowStart = nowSec - DAY_SECONDS

    const reconstructable = useMemo(
        () => portfolioTokens.filter((t) => needsPriceHistory(t.token.address, chainId)),
        [portfolioTokens, chainId]
    )

    const priceQueries = useQueries({
        queries: reconstructable.map((t) => ({
            queryKey: [
                'nw-native-price',
                chainId,
                t.token.address.toLowerCase(),
                t.tokenType,
                windowStart,
            ],
            queryFn: () =>
                fetchTokenPriceHistory(
                    chainId,
                    t.token.address.toLowerCase(),
                    windowStart,
                    t.tokenType === 'bonding_curve' ? 'bc' : 'v3'
                ),
            enabled: supported,
            staleTime: 60_000,
        })),
    })

    const arePricesLoading = supported && priceQueries.some((q) => q.data === undefined)

    const nativePricePointsByToken = useMemo(() => {
        const map = new Map<string, PricePoint[]>()
        reconstructable.forEach((t, i) => {
            map.set(t.token.address.toLowerCase(), priceQueries[i]?.data ?? [])
        })
        return map
    }, [reconstructable, priceQueries])

    const isSettling = params.isInputLoading || arePricesLoading

    const series = useMemo(() => {
        if (!address || !supported || nativeUsdPrice === null || isSettling) return null

        return computeNetWorthHistory({
            chainId,
            tokens: portfolioTokens.map((t) => ({
                address: t.token.address,
                decimals: t.token.decimals,
                balance: parseFloat(t.formattedBalance) || 0,
                priceUsd: t.priceUsd ?? 0,
            })),
            swapEvents: swapEvents ?? [],
            nativeUsdPoints,
            nativeUsdNow: nativeUsdPrice,
            netWorthNow: params.netWorthNow,
            nowSec,
            nativePricePointsByToken,
            windowStart,
        })
    }, [
        address,
        supported,
        nativeUsdPrice,
        isSettling,
        chainId,
        portfolioTokens,
        swapEvents,
        nativePricePointsByToken,
        nativeUsdPoints,
        windowStart,
        nowSec,
        params.netWorthNow,
    ])

    const scope = `${chainId}:${address?.toLowerCase() ?? ''}`
    const cacheRef = useRef<{ scope: string; series: NetWorthPoint[] } | null>(null)
    if (cacheRef.current && cacheRef.current.scope !== scope) cacheRef.current = null
    if (series) cacheRef.current = { scope, series }

    return cacheRef.current?.series ?? EMPTY_HISTORY
}
