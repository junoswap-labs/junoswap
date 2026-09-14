'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchV3TokenSnapshots } from '@coshi190/juno-moneta-sdk'
import { TOTAL_SUPPLY } from '@/lib/launchpad-curve'
import { ponderClient, isPonderError } from '@/lib/ponder-client'

// Market caps for graduated tokens from the indexer's per-swap V3 snapshot. A pool's
// sqrtPriceX96 only moves on Swap, so lastPriceNative is the same number slot0() would
// return, just lagged by indexing — and this shares its request with useTokenPriceMap
// instead of firing a getPool + slot0 multicall pair per token.
export function useGraduatedMarketCaps(
    tokenAddresses: Address[],
    chainId: number
): Map<string, number> {
    const { data: snapshots } = useQuery({
        queryKey: ['v3-token-snapshots', chainId],
        queryFn: async () => {
            try {
                return await fetchV3TokenSnapshots(ponderClient, { chainId })
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        staleTime: 30_000,
    })

    return useMemo(() => {
        const result = new Map<string, number>()
        if (!snapshots || tokenAddresses.length === 0) return result

        const wanted = new Set(tokenAddresses.map((a) => a.toLowerCase()))

        for (const s of snapshots) {
            const tokenAddr = s.tokenAddr.toLowerCase()
            if (!wanted.has(tokenAddr)) continue
            const price = parseFloat(s.lastPriceNative ?? '0')
            if (!(price > 0)) continue
            result.set(tokenAddr, price * TOTAL_SUPPLY)
        }

        return result
    }, [snapshots, tokenAddresses])
}
