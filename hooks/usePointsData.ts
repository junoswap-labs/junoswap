'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useChainId } from 'wagmi'
import {
    getTimeThreshold,
    fetchSwapEvents,
    safeFormatEther,
    isLeaderboardSupportedChain,
} from '@/lib/leaderboard-utils'
import type { PointsTrader, PointsTimePeriod, PointsSortKey, SortDirection } from '@/types/points'

export interface UserPointsSummary {
    points: number
    rank: number
    totalTraders: number
    volumeUsd: number
    tradeCount: number
    tierName: string
    nextTierLabel: string | null
    pointsToNextTier: number
    progressPercent: number
}

const PAGE_SIZE = 20

function getTierInfo(points: number) {
    const TIER_BOUNDARIES = [
        { min: 0, max: 99, name: 'Bronze', next: 'Silver' },
        { min: 100, max: 999, name: 'Silver', next: 'Gold' },
        { min: 1_000, max: 9_999, name: 'Gold', next: 'Platinum' },
        { min: 10_000, max: 49_999, name: 'Platinum', next: 'Diamond' },
        { min: 50_000, max: Infinity, name: 'Diamond', next: null },
    ]
    for (const t of TIER_BOUNDARIES) {
        if (points >= t.min && points <= t.max) return t
    }
    return TIER_BOUNDARIES[0]
}

export function usePointsData(
    timePeriod: PointsTimePeriod,
    sortKey: PointsSortKey,
    sortDirection: SortDirection,
    searchQuery: string,
    page: number,
    nativeUsdPrice: number | null
) {
    const { address: userAddress } = useAccount()
    const chainId = useChainId()
    const isSupportedChain = isLeaderboardSupportedChain(chainId)

    const { data: rawSwapEvents } = useQuery({
        queryKey: ['points-data', timePeriod, chainId],
        queryFn: () => fetchSwapEvents(getTimeThreshold(timePeriod)),
        enabled: isSupportedChain,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    return useMemo(() => {
        if (!isSupportedChain) {
            return {
                traders: [],
                totalCount: 0,
                totalPages: 0,
                totalPointsAll: 0,
                totalVolumeUsd: 0,
                userSummary: null,
                isLoading: false,
                isSupportedChain,
            }
        }

        if (!rawSwapEvents || nativeUsdPrice === null) {
            return {
                traders: [],
                totalCount: 0,
                totalPages: 0,
                totalPointsAll: 0,
                totalVolumeUsd: 0,
                userSummary: null,
                isLoading: true,
                isSupportedChain,
            }
        }

        interface SwapAgg {
            volumeNative: number
            tradeCount: number
            buyCount: number
            sellCount: number
        }
        const bySender = new Map<string, SwapAgg>()

        for (const e of rawSwapEvents) {
            const sender = e.sender.toLowerCase()
            const isBuy = e.isBuy === 1
            const nativeAmount = safeFormatEther(isBuy ? e.amountIn : e.amountOut)

            let agg = bySender.get(sender)
            if (!agg) {
                agg = { volumeNative: 0, tradeCount: 0, buyCount: 0, sellCount: 0 }
                bySender.set(sender, agg)
            }

            agg.volumeNative += nativeAmount
            agg.tradeCount++
            if (isBuy) agg.buyCount++
            else agg.sellCount++
        }

        const allTraders: PointsTrader[] = []
        for (const [addr, agg] of bySender) {
            const volumeUsd = agg.volumeNative * nativeUsdPrice
            allTraders.push({
                rank: 0,
                address: addr,
                volumeNative: agg.volumeNative,
                volumeUsd,
                points: Math.floor(volumeUsd / 100),
                tradeCount: agg.tradeCount,
                buyCount: agg.buyCount,
                sellCount: agg.sellCount,
            })
        }

        const sortFn = (a: PointsTrader, b: PointsTrader) => {
            let aVal: number, bVal: number
            switch (sortKey) {
                case 'points':
                    aVal = a.points
                    bVal = b.points
                    break
                case 'volume':
                    aVal = a.volumeUsd
                    bVal = b.volumeUsd
                    break
                case 'trades':
                    aVal = a.tradeCount
                    bVal = b.tradeCount
                    break
            }
            return sortDirection === 'desc' ? bVal - aVal : aVal - bVal
        }
        allTraders.sort(sortFn)

        const filtered = searchQuery
            ? allTraders.filter((t) => t.address.includes(searchQuery.toLowerCase()))
            : allTraders

        filtered.forEach((t, i) => {
            t.rank = i + 1
        })

        const totalPointsAll = allTraders.reduce((sum, t) => sum + t.points, 0)
        const totalVolumeUsd = allTraders.reduce((sum, t) => sum + t.volumeUsd, 0)

        let userSummary: UserPointsSummary | null = null
        if (userAddress) {
            const userAddr = userAddress.toLowerCase()
            const userTrader = allTraders.find((t) => t.address === userAddr)
            if (userTrader) {
                const tier = getTierInfo(userTrader.points)!

                const progress =
                    tier.max === Infinity
                        ? 100
                        : ((userTrader.points - tier.min) / (tier.max - tier.min + 1)) * 100
                userSummary = {
                    points: userTrader.points,
                    rank: userTrader.rank,
                    totalTraders: allTraders.length,
                    volumeUsd: userTrader.volumeUsd,
                    tradeCount: userTrader.tradeCount,
                    tierName: tier.name,
                    nextTierLabel: tier.next,
                    pointsToNextTier: tier.max === Infinity ? 0 : tier.max + 1 - userTrader.points,
                    progressPercent: Math.min(progress, 100),
                }
            }
        }

        const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
        const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

        return {
            traders: paginated,
            totalCount: filtered.length,
            totalPages,
            totalPointsAll,
            totalVolumeUsd,
            userSummary,
            isLoading: false,
            isSupportedChain,
        }
    }, [
        rawSwapEvents,
        nativeUsdPrice,
        sortKey,
        sortDirection,
        searchQuery,
        page,
        userAddress,
        isSupportedChain,
    ])
}
