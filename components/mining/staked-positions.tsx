'use client'

import { useMemo } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TokenIconPair, TokenIconSkeleton } from '@/components/ui/token-icon'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import type { StakedPosition } from '@/types/earn'
import { usePositionsByTokenIds } from '@/hooks/useUserPositions'
import { useIncentives } from '@/hooks/useIncentives'
import { useStakedPositions } from '@/hooks/useStakedPositions'
import { usePendingRewardsMultiple } from '@/hooks/useRewards'
import { useDepositedTokenIds } from '@/hooks/useDepositedTokenIds'
import { formatTimeRemaining } from '@/services/mining/incentives'
import { formatRewardAmount } from '@/lib/format'
import { getV3StakerAddress } from '@/lib/dex-config'
import { KNOWN_INCENTIVES } from '@/lib/mining-constants'

function LoadingState() {
    return (
        <div className="space-y-3">
            {[1, 2].map((i) => (
                <Card key={i}>
                    <CardContent className="p-5">
                        <div className="animate-pulse space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex -space-x-2">
                                        <TokenIconSkeleton size="md" />
                                        <TokenIconSkeleton size="md" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="h-4 w-28 bg-muted rounded" />
                                        <div className="h-3 w-20 bg-muted rounded" />
                                    </div>
                                </div>
                                <div className="h-5 w-16 bg-muted rounded-full" />
                            </div>
                            <div className="h-[1px] bg-muted" />
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <div className="h-3 w-24 bg-muted rounded" />
                                    <div className="h-6 w-20 bg-muted rounded" />
                                </div>
                                <div className="space-y-2">
                                    <div className="h-3 w-28 bg-muted rounded" />
                                    <div className="h-4 w-24 bg-muted rounded" />
                                </div>
                                <div className="flex items-end justify-end">
                                    <div className="h-8 w-16 bg-muted rounded" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export function StakedPositions({
    onUnstake,
}: {
    onUnstake: (stakedPosition: StakedPosition) => void
}) {
    const { address } = useAccount()
    const chainId = useChainId()
    const stakerAddress = getV3StakerAddress(chainId)
    const { tokenIds, isLoading: isLoadingTokenIds } = useDepositedTokenIds(address)
    const { positions: depositedPositions, isLoading: isLoadingPositions } = usePositionsByTokenIds(
        tokenIds,
        chainId
    )
    const incentiveKeys = useMemo(() => KNOWN_INCENTIVES[chainId] ?? [], [chainId])
    const { incentives, isLoading: isLoadingIncentives } = useIncentives(incentiveKeys)
    const { stakedPositions, isLoading: isLoadingStaked } = useStakedPositions(
        depositedPositions,
        incentives,
        address
    )
    const { rewards: rewardsMap, isLoading: isLoadingRewards } =
        usePendingRewardsMultiple(stakedPositions)
    const enrichedPositions = useMemo(() => {
        return stakedPositions.map((sp) => {
            const key = `${sp.tokenId.toString()}-${sp.incentiveId}`
            return {
                ...sp,
                pendingRewards: rewardsMap.get(key) ?? 0n,
            }
        })
    }, [stakedPositions, rewardsMap])
    if (!stakerAddress) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold">My Staked Positions</h2>
                <EmptyState
                    title="Not available"
                    description="LP Mining is not available on this chain."
                />
            </div>
        )
    }
    if (!address) {
        return (
            <EmptyState
                title="Connect wallet"
                description="Connect your wallet to view staked positions."
            />
        )
    }
    const isLoading =
        isLoadingTokenIds ||
        isLoadingPositions ||
        isLoadingIncentives ||
        isLoadingStaked ||
        isLoadingRewards
    if (isLoading) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold">My Staked Positions</h2>
                <LoadingState />
            </div>
        )
    }
    if (enrichedPositions.length === 0) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold">My Staked Positions</h2>
                <EmptyState
                    title="No staked positions"
                    description="Stake your LP positions in a mining pool to earn rewards."
                />
            </div>
        )
    }
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold">My Staked Positions</h2>
                <p className="text-sm text-muted-foreground">
                    {enrichedPositions.length} staked position
                    {enrichedPositions.length !== 1 ? 's' : ''}
                </p>
            </div>
            <div className="space-y-3">
                {enrichedPositions.map((sp) => (
                    <StakedPositionCard
                        key={`${sp.tokenId.toString()}-${sp.incentiveId}`}
                        stakedPosition={sp}
                        onUnstake={onUnstake}
                    />
                ))}
            </div>
        </div>
    )
}

interface StakedPositionCardProps {
    stakedPosition: StakedPosition
    onUnstake: (stakedPosition: StakedPosition) => void
}

function StakedPositionCard({ stakedPosition, onUnstake }: StakedPositionCardProps) {
    const { position, incentive, pendingRewards } = stakedPosition
    const timeRemaining = formatTimeRemaining(incentive.endTime)
    const formattedRewards = formatRewardAmount(pendingRewards, incentive.rewardTokenInfo.decimals)

    return (
        <Card className="position-card-hover">
            <CardContent className="p-5">
                {/* Header: Identity + Status */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <TokenIconPair
                            src0={position.token0Info.logo}
                            symbol0={position.token0Info.symbol}
                            src1={position.token1Info.logo}
                            symbol1={position.token1Info.symbol}
                            size="md"
                        />
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                    {position.token0Info.symbol} / {position.token1Info.symbol}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                    #{position.tokenId.toString()}
                                </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                                Mining for {incentive.rewardTokenInfo.symbol}
                            </div>
                        </div>
                    </div>
                    {incentive.isActive ? (
                        <Badge
                            variant="outline"
                            className="bg-positive/15 text-positive border-positive/25"
                        >
                            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-positive" />
                            Active
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                            Ended
                        </Badge>
                    )}
                </div>

                <Separator className="my-4" />

                {/* Data grid */}
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Pending Rewards
                        </div>
                        <div className="text-lg font-bold font-mono tracking-tight mt-1">
                            {formattedRewards}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {incentive.rewardTokenInfo.symbol}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Time Remaining
                        </div>
                        <div className="text-sm font-medium mt-1">{timeRemaining}</div>
                    </div>
                    <div className="flex items-end justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onUnstake(stakedPosition)}
                        >
                            Unstake
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
