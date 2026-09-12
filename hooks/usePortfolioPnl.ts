'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { TokenHolding } from '@/hooks/useMultiBalances'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import {
    fetchPortfolioPnl,
    EMPTY_PNL_TOTALS,
    type TokenPnl,
    type PortfolioPnlTotals,
} from '@/lib/user-pnl'

export function usePortfolioPnl(
    address: Address | undefined,
    chainId: number,
    holdings: Map<string, TokenHolding>
) {
    const isSupportedChain = isLeaderboardSupportedChain(chainId)

    const { data } = useQuery({
        queryKey: ['portfolio-pnl', address, chainId],
        queryFn: () => fetchPortfolioPnl(chainId, address!.toLowerCase()),
        enabled: !!address && isSupportedChain,
        staleTime: 60_000,
    })

    return useMemo(() => {
        const perToken = data?.perToken ?? {}
        const totals: PortfolioPnlTotals = data?.totals ?? EMPTY_PNL_TOTALS
        const pnlByToken = new Map<string, TokenPnl | null>()
        for (const key of holdings.keys()) {
            pnlByToken.set(key, perToken[key] ?? null)
        }
        return { pnlByToken, totals }
    }, [data, holdings])
}
