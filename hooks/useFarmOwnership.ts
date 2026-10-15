'use client'

import { useMemo } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useUserPositions } from '@/hooks/useUserPositions'
import { useStakedPositions } from '@/hooks/useStakedPositions'
import type { FarmOwnershipFilter, Incentive } from '@/types/earn'

const EMPTY_SET: ReadonlySet<string> = new Set()

/**
 * Backing data for the ownership filters. Both answers cost RPC — the position sweep, and on top of
 * that a `stakes()` read per position per farm — so each is requested only while the filter that
 * needs it is selected. Passing `undefined` as the owner is what disables the underlying queries.
 */
export function useFarmOwnership(
    incentives: readonly Incentive[],
    filter: FarmOwnershipFilter | 'all'
): {
    stakedIncentiveIds: ReadonlySet<string>
    myPoolAddresses: ReadonlySet<string>
    isLoading: boolean
} {
    const { address } = useAccount()
    const chainId = useChainId()

    const needsPositions = filter !== 'all'
    const needsStakes = filter === 'my-staked'
    const owner = needsPositions ? address : undefined

    const { positions, isLoading: isLoadingPositions } = useUserPositions(owner, chainId)

    const stakeInputPositions = useMemo(
        () => (needsStakes ? positions : []),
        [needsStakes, positions]
    )
    const stakeInputIncentives = useMemo(
        () => (needsStakes ? [...incentives] : []),
        [needsStakes, incentives]
    )

    const { stakedPositions, isLoading: isLoadingStakes } = useStakedPositions(
        stakeInputPositions,
        stakeInputIncentives,
        needsStakes ? address : undefined
    )

    const myPoolAddresses = useMemo(() => {
        if (!needsPositions) return EMPTY_SET
        return new Set(positions.map((p) => p.poolAddress.toLowerCase()))
    }, [needsPositions, positions])

    const stakedIncentiveIds = useMemo(() => {
        if (!needsStakes) return EMPTY_SET
        return new Set(stakedPositions.map((s) => s.incentiveId))
    }, [needsStakes, stakedPositions])

    return {
        stakedIncentiveIds,
        myPoolAddresses,
        isLoading: needsPositions && (isLoadingPositions || (needsStakes && isLoadingStakes)),
    }
}
