'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useChainId } from 'wagmi'
import { fetchReferralRewards } from '@coshi190/juno-moneta-sdk'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import { ponderClient, isPonderError } from '@/lib/ponder-client'

export interface ReferredTrader {
    address: string
    points: number
    volumeUsd: number
}

export interface ReferralRewards {
    referralPoints: number
    refereeCount: number
    referees: ReferredTrader[]
    isLoading: boolean
    isSupportedChain: boolean
}

const EMPTY = { referralPoints: 0, refereeCount: 0, referees: [] as ReferredTrader[] }

export function useReferralRewards(): ReferralRewards {
    const { address } = useAccount()
    const chainId = useChainId()
    const isSupportedChain = isLeaderboardSupportedChain(chainId)
    const enabled = isSupportedChain && !!address

    const { data, isLoading } = useQuery({
        queryKey: ['referral-rewards', address?.toLowerCase(), chainId],
        queryFn: async () => {
            try {
                return await fetchReferralRewards(ponderClient, { chainId, referrer: address! })
            } catch (e) {
                if (isPonderError(e)) return EMPTY
                throw e
            }
        },
        enabled,
        placeholderData: (prev) => prev,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    return useMemo(
        () => ({
            ...(data ?? EMPTY),
            isLoading: enabled && isLoading,
            isSupportedChain,
        }),
        [data, enabled, isLoading, isSupportedChain]
    )
}
