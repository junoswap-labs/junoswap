'use client'

import { useMemo } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Card, CardContent } from '@/components/ui/card'
import { useIncentives } from '@/hooks/useIncentives'
import { usePositionsByTokenIds } from '@/hooks/useUserPositions'
import { useStakedPositions } from '@/hooks/useStakedPositions'
import { usePendingRewardsMultiple } from '@/hooks/useRewards'
import { useDepositedTokenIds } from '@/hooks/useDepositedTokenIds'
import { formatRewardAmount } from '@/lib/format'
import { KNOWN_INCENTIVES } from '@/lib/mining-constants'

export function MiningSummary() {
    const { address } = useAccount()
    const chainId = useChainId()
    const incentiveKeys = useMemo(() => KNOWN_INCENTIVES[chainId] ?? [], [chainId])
    const { incentives } = useIncentives(incentiveKeys)
    const activeCount = incentives.filter((i) => !i.isEnded).length

    const { tokenIds } = useDepositedTokenIds(address)
    const { positions: depositedPositions } = usePositionsByTokenIds(tokenIds, chainId)
    const { stakedPositions } = useStakedPositions(depositedPositions, incentives, address)
    const { rewards: rewardsMap } = usePendingRewardsMultiple(stakedPositions)

    const enrichedPositions = useMemo(() => {
        return stakedPositions.map((sp) => {
            const key = `${sp.tokenId.toString()}-${sp.incentiveId}`
            return {
                ...sp,
                pendingRewards: rewardsMap.get(key) ?? 0n,
            }
        })
    }, [stakedPositions, rewardsMap])

    const totalRewards = useMemo(() => {
        if (enrichedPositions.length === 0) return null
        // Group by reward token symbol
        const grouped = new Map<string, { total: bigint; decimals: number }>()
        for (const sp of enrichedPositions) {
            const symbol = sp.incentive.rewardTokenInfo.symbol
            const existing = grouped.get(symbol)
            if (existing) {
                existing.total += sp.pendingRewards
            } else {
                grouped.set(symbol, {
                    total: sp.pendingRewards,
                    decimals: sp.incentive.rewardTokenInfo.decimals,
                })
            }
        }
        return Array.from(grouped.entries()).map(([symbol, { total, decimals }]) => ({
            symbol,
            formatted: formatRewardAmount(total, decimals),
        }))
    }, [enrichedPositions])

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
                <CardContent className="p-4 flex items-center gap-3">
                    <div>
                        <div className="text-xs text-muted-foreground">Active Mining Pools</div>
                        <div className="text-xl font-bold">{activeCount}</div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4 flex items-center gap-3">
                    <div>
                        <div className="text-xs text-muted-foreground">Your Stakes</div>
                        <div className="text-xl font-bold">{enrichedPositions.length}</div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4 flex items-center gap-3">
                    <div>
                        <div className="text-xs text-muted-foreground">Pending Rewards</div>
                        <div className="text-xl font-bold">
                            {totalRewards && totalRewards.length > 0
                                ? totalRewards.map((r) => `${r.formatted} ${r.symbol}`).join(' + ')
                                : '0'}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
