'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useChainId } from 'wagmi'
import {
    aggregatePointsByAddress,
    computeReferralPoints,
    fetchSwapEventsForSenders,
    isLeaderboardSupportedChain,
} from '@/lib/leaderboard-utils'
import { fetchReferralBindings } from '@/lib/swap-events'

interface ReferredTrader {
    address: string
    points: number
    volumeUsd: number
}

export interface ReferralRewards {
    /** 10% of the summed points of every wallet bound to the connected user. */
    referralPoints: number
    refereeCount: number
    referees: ReferredTrader[]
    isLoading: boolean
    isSupportedChain: boolean
}

const EMPTY = { referees: [] as string[], rows: [] }

/**
 * Referral earnings for the connected wallet under the sticky first-touch model: every
 * wallet bound to it (indexer `referralBinding`) contributes 10% of its all-time points.
 * Independent of the points page's time filter — referral rewards are cumulative.
 */
export function useReferralRewards(nativeUsdPrice: number | null): ReferralRewards {
    const { address } = useAccount()
    const chainId = useChainId()
    const isSupportedChain = isLeaderboardSupportedChain(chainId)
    const enabled = isSupportedChain && !!address

    const { data, isLoading } = useQuery({
        queryKey: ['referral-rewards', address?.toLowerCase(), chainId],
        queryFn: async () => {
            const referees = await fetchReferralBindings(address!.toLowerCase())
            if (referees.length === 0) return EMPTY
            const rows = await fetchSwapEventsForSenders(chainId, referees)
            return { referees, rows }
        },
        enabled,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    return useMemo(() => {
        if (!enabled || !data) {
            return {
                referralPoints: 0,
                refereeCount: 0,
                referees: [],
                isLoading: enabled && isLoading,
                isSupportedChain,
            }
        }
        const price = nativeUsdPrice ?? 0
        const byAddr = aggregatePointsByAddress(data.rows)
        const referees: ReferredTrader[] = data.referees.map((addr) => {
            const agg = byAddr.get(addr)
            return {
                address: addr,
                points: agg?.points ?? 0,
                volumeUsd: (agg?.volumeNative ?? 0) * price,
            }
        })
        referees.sort((a, b) => b.points - a.points)
        return {
            referralPoints: computeReferralPoints(referees.map((r) => r.points)),
            refereeCount: referees.length,
            referees,
            isLoading: false,
            isSupportedChain,
        }
    }, [enabled, data, isLoading, nativeUsdPrice, isSupportedChain])
}
