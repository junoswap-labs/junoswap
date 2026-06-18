'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { isPonderError } from '@/lib/ponder-client'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import { isLaunchpadChain } from '@/lib/abis/pump-core-native'
import { fetchBondingCurveSwaps, fetchV3Swaps, fetchV2Swaps } from '@/lib/swap-events'

export interface UserSwapEvent {
    tokenAddr: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
}

export function useUserSwapEvents(address: Address | undefined, chainId: number) {
    const isSupportedChain = isLeaderboardSupportedChain(chainId)
    const hasLaunchpad = isLaunchpadChain(chainId)

    return useQuery({
        queryKey: ['user-swap-events', address, chainId],
        queryFn: async (): Promise<UserSwapEvent[]> => {
            if (!address || !isSupportedChain) return []
            const sender = address.toLowerCase()
            try {
                // Same protocols and parsing as the leaderboard/points fetchers, scoped
                // to this trader, so portfolio PnL matches the leaderboard exactly.
                const [bondingCurveEvents, v3Events, v2Events] = await Promise.all([
                    hasLaunchpad ? fetchBondingCurveSwaps({ sender }) : Promise.resolve([]),
                    fetchV3Swaps(chainId, { sender }),
                    fetchV2Swaps(chainId, { sender }),
                ])
                return [...bondingCurveEvents, ...v3Events, ...v2Events]
                    .map((e) => ({
                        tokenAddr: e.tokenAddr,
                        isBuy: e.isBuy,
                        amountIn: e.amountIn,
                        amountOut: e.amountOut,
                        timestamp: e.timestamp,
                    }))
                    .sort((a, b) => a.timestamp - b.timestamp)
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: !!address && isSupportedChain,
        staleTime: 60_000,
    })
}
