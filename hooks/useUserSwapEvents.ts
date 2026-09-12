'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchUserSwapEvents, type UserSwapEvent } from '@/lib/user-swaps'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'

export type { UserSwapEvent }

export function useUserSwapEvents(address: Address | undefined, chainId: number) {
    const isSupportedChain = isLeaderboardSupportedChain(chainId)

    return useQuery({
        queryKey: ['user-swap-events', address, chainId],
        queryFn: async (): Promise<UserSwapEvent[]> => {
            if (!address || !isSupportedChain) return []
            return fetchUserSwapEvents(chainId, address)
        },
        enabled: !!address && isSupportedChain,
        staleTime: 60_000,
    })
}
