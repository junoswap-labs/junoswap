'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useChainId } from 'wagmi'
import {
    getTimeThreshold,
    fetchSwapEvents,
    fetchV3SwapEvents,
    fetchV2SwapEvents,
    aggregatePointsByAddress,
    computeReferralPoints,
    isLeaderboardSupportedChain,
} from '@/lib/leaderboard-utils'
import { fetchAllReferralBindings } from '@/lib/swap-events'
import { isLaunchpadChain } from '@/lib/abis/bonding-curve-junoswap'
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
        queryFn: async () => {
            const since = getTimeThreshold(timePeriod)
            // Bonding-curve volume only exists on the launchpad chain; V3 (junoswap +
            // external kublerx) and external V2 volume are indexed for all supported
            // chains. Count every source where available.
            const [bondingCurve, v3, v2] = await Promise.all([
                isLaunchpadChain(chainId) ? fetchSwapEvents(chainId, since) : Promise.resolve([]),
                fetchV3SwapEvents(chainId, since),
                fetchV2SwapEvents(chainId, since),
            ])
            return [...bondingCurve, ...v3, ...v2]
        },
        enabled: isSupportedChain,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const { data: referralBindings } = useQuery({
        queryKey: ['referral-bindings-all', chainId],
        queryFn: fetchAllReferralBindings,
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

        if (!rawSwapEvents || !referralBindings) {
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

        // A chain may have no indexed native/USD stable-pool price yet. Fall back
        // to 0 (points/volume render as 0) rather than hanging on "loading".
        const effectiveNativeUsdPrice = nativeUsdPrice ?? 0

        const aggMap = aggregatePointsByAddress(rawSwapEvents)
        const allTraders: PointsTrader[] = []
        for (const [addr, agg] of aggMap) {
            const referees = referralBindings.get(addr) ?? []
            allTraders.push({
                rank: 0,
                address: addr,
                volumeNative: agg.volumeNative,
                volumeUsd: agg.volumeNative * effectiveNativeUsdPrice,
                points: agg.points,
                referredPoints: computeReferralPoints(
                    referees.map((a) => aggMap.get(a)?.points ?? 0)
                ),
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
                case 'referred':
                    aVal = a.referredPoints
                    bVal = b.referredPoints
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
        referralBindings,
        nativeUsdPrice,
        sortKey,
        sortDirection,
        searchQuery,
        page,
        userAddress,
        isSupportedChain,
    ])
}
