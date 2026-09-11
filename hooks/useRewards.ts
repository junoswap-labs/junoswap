'use client'

import { getStakerAddress, type EarnProgram } from '@/lib/earn-programs'
import { useMemo, useRef } from 'react'
import { useReadContract, useReadContracts, useChainId } from 'wagmi'
import type { IncentiveKey, StakedPosition } from '@/types/earn'
import { UNISWAP_V3_STAKER_ABI } from '@/lib/abis/uniswap-v3-staker'
import { calculateRewardRate } from '@/services/mining/create-incentive'
export function usePendingRewards(
    incentiveKey: IncentiveKey | null,
    tokenId: bigint | undefined,
    program: EarnProgram
): {
    reward: bigint
    secondsInsideX128: bigint
    isLoading: boolean
    refetch: () => void
} {
    const chainId = useChainId()
    const stakerAddress = getStakerAddress(chainId, program)
    const isEnabled = !!incentiveKey && tokenId !== undefined && !!stakerAddress
    const { data, isLoading, refetch } = useReadContract({
        address: stakerAddress,
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'getRewardInfo',
        args: incentiveKey
            ? [
                  {
                      rewardToken: incentiveKey.rewardToken,
                      pool: incentiveKey.pool,
                      startTime: BigInt(incentiveKey.startTime),
                      endTime: BigInt(incentiveKey.endTime),
                      refundee: incentiveKey.refundee,
                  },
                  tokenId!,
              ]
            : undefined,
        query: {
            enabled: isEnabled,
            refetchInterval: 15_000, // Refresh every 15 seconds
            staleTime: 10_000,
        },
    })
    const result = data as [bigint, bigint] | undefined
    return {
        reward: result?.[0] ?? 0n,
        secondsInsideX128: result?.[1] ?? 0n,
        isLoading,
        refetch,
    }
}

/**
 * Rewards accrue continuously on-chain at a rate that depends on the position's live share of the
 * pool's in-range liquidity (not just other stakers), so there's no fixed "daily rate" to read.
 * Instead this tracks a reward/timestamp baseline per position and derives the rate from how much
 * accrued between polls, extrapolated to a day.
 */
/** Reward reads follow each position's own staker, so a merged list settles in one batch. */
export function usePendingRewardsMultiple(stakedPositions: StakedPosition[]): {
    rewards: Map<string, bigint> // Map of tokenId-incentiveId to reward
    dailyRates: Map<string, number> // Map of tokenId-incentiveId to estimated SHK/day
    isLoading: boolean
    refetch: () => void
} {
    const chainId = useChainId()
    const contracts = useMemo(() => {
        return stakedPositions.flatMap((sp) => {
            const staker = getStakerAddress(chainId, sp.incentive.program)
            if (!staker) return []
            return [
                {
                    address: staker,
                    abi: UNISWAP_V3_STAKER_ABI,
                    functionName: 'getRewardInfo' as const,
                    args: [
                        {
                            rewardToken: sp.incentive.rewardToken,
                            pool: sp.incentive.pool,
                            startTime: BigInt(sp.incentive.startTime),
                            endTime: BigInt(sp.incentive.endTime),
                            refundee: sp.incentive.refundee,
                        },
                        sp.tokenId,
                    ] as const,
                    chainId,
                },
            ]
        })
    }, [stakedPositions, chainId])
    const { data, isLoading, refetch } = useReadContracts({
        contracts,
        query: {
            enabled: contracts.length > 0,
            refetchInterval: 15_000,
            staleTime: 10_000,
        },
    })
    const baselinesRef = useRef(new Map<string, { reward: bigint; timestampMs: number }>())

    const { rewards, dailyRates } = useMemo(() => {
        const rewardMap = new Map<string, bigint>()
        const rateMap = new Map<string, number>()
        if (!data) return { rewards: rewardMap, dailyRates: rateMap }
        const now = Date.now()
        stakedPositions.forEach((sp, index) => {
            const result = data[index]?.result as [bigint, bigint] | undefined
            const reward = result?.[0] ?? 0n
            const key = `${sp.tokenId.toString()}-${sp.incentiveId}`
            rewardMap.set(key, reward)

            const baseline = baselinesRef.current.get(key)
            if (!baseline) {
                baselinesRef.current.set(key, { reward, timestampMs: now })
                return
            }
            const elapsedSeconds = (now - baseline.timestampMs) / 1000
            const rate = calculateRewardRate(
                reward - baseline.reward,
                sp.incentive.rewardTokenInfo.decimals,
                elapsedSeconds
            ).perDay
            if (rate > 0) rateMap.set(key, rate)
        })
        return { rewards: rewardMap, dailyRates: rateMap }
    }, [data, stakedPositions])

    return {
        rewards,
        dailyRates,
        isLoading,
        refetch,
    }
}
