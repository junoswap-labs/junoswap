'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import type { V3Position } from '@/types/earn'
import { MAX_UINT128 } from '@/types/earn'
import { getAbi, getDexes } from '@coshi190/juno-moneta-sdk'
export interface PositionFees {
    fees0: bigint
    fees1: bigint
}

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
    const positionManager = getDexes(chainId, 'v3')[0]?.positionManager

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
                        abi: getAbi('positionManager'),
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
