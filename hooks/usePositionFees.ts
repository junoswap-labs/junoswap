'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import type { V3Position } from '@/types/earn'
import { MAX_UINT128 } from '@/types/earn'
import { getV3Config } from '@/lib/dex-config'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '@/lib/abis/nonfungible-position-manager'

export interface PositionFees {
    fees0: bigint
    fees1: bigint
}

/**
 * Live unclaimed fees per position, keyed by tokenId string.
 *
 * The `positions().tokensOwed0/1` checkpoint only updates when the owner pokes the
 * position, so it reads 0 for an in-range position that earned fees purely from swaps.
 * Instead we statically simulate `collect()` (from = owner, MAX_UINT128 maxes): the
 * NonfungiblePositionManager pokes the pool via `burn(0)` before returning the owed
 * amounts, so the result reflects fees accrued up to the latest block. On any revert
 * (e.g. owner not authorized for a staked position) we fall back to `tokensOwed0/1`.
 */
export function usePositionFees(
    positions: V3Position[],
    owner: Address | undefined,
    chainId: number
): {
    feesMap: Map<string, PositionFees>
    isLoading: boolean
    refetch: () => void
} {
    const publicClient = usePublicClient({ chainId })
    const positionManager = getV3Config(chainId)?.positionManager

    const fallbacks = useMemo(() => {
        const map = new Map<string, PositionFees>()
        for (const p of positions) {
            map.set(p.tokenId.toString(), { fees0: p.tokensOwed0, fees1: p.tokensOwed1 })
        }
        return map
    }, [positions])

    const tokenIdKey = useMemo(() => positions.map((p) => p.tokenId.toString()), [positions])

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['position-fees', chainId, owner, tokenIdKey],
        queryFn: async (): Promise<Map<string, PositionFees>> => {
            if (!publicClient || !positionManager || !owner) return fallbacks
            const results = await Promise.allSettled(
                positions.map((p) =>
                    publicClient.simulateContract({
                        address: positionManager,
                        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
                        functionName: 'collect',
                        args: [
                            {
                                tokenId: p.tokenId,
                                recipient: owner,
                                amount0Max: MAX_UINT128,
                                amount1Max: MAX_UINT128,
                            },
                        ],
                        account: owner,
                    })
                )
            )
            const map = new Map<string, PositionFees>()
            positions.forEach((p, i) => {
                const key = p.tokenId.toString()
                const res = results[i]
                if (res?.status === 'fulfilled') {
                    const [amount0, amount1] = res.value.result as [bigint, bigint]
                    map.set(key, { fees0: amount0, fees1: amount1 })
                } else {
                    map.set(key, fallbacks.get(key) ?? { fees0: 0n, fees1: 0n })
                }
            })
            return map
        },
        enabled: !!publicClient && !!positionManager && !!owner && positions.length > 0,
        staleTime: 10_000,
    })

    return {
        feesMap: data ?? fallbacks,
        isLoading,
        refetch,
    }
}
