'use client'

import { useMemo, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { ChevronDown, ChevronRight, Minus, Plus, Unlock, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TokenIconPair, TokenIconSkeleton } from '@/components/ui/token-icon'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { ConnectButton } from '@/components/web3/connect-button'
import { PriceRangeBar } from '@/components/positions/price-range-bar'
import { useUserPositions, usePositionsByTokenIds } from '@/hooks/useUserPositions'
import { useDepositedTokenIds } from '@/hooks/useDepositedTokenIds'
import { useIncentives } from '@/hooks/useIncentives'
import { useStakedPositions } from '@/hooks/useStakedPositions'
import { usePendingRewardsMultiple } from '@/hooks/useRewards'
import { formatTokenAmount, getDisplayToken } from '@/services/tokens'
import { formatLiquidityAmount, formatRewardAmount } from '@/lib/format'
import { tickToPrice, MIN_TICK, MAX_TICK } from '@/lib/liquidity-helpers'
import { KNOWN_INCENTIVES } from '@/lib/mining-constants'
import type { PositionWithTokens, StakedPosition } from '@/types/earn'

// Full-range positions land a few ticks inside MIN/MAX depending on the pool's tick
// spacing (widest is 200), since the bounds are nearestUsableTick(MIN/MAX, spacing).
// A fixed tolerance detects them regardless of the fee→spacing assumption; at this
// many ticks from the extreme the price is still effectively 0 / ∞, so no genuinely
// bounded position is misclassified.
const FULL_RANGE_TICK_TOLERANCE = 256

interface PositionActions {
    onCollectFees: (position: PositionWithTokens) => void
    onRemoveLiquidity: (position: PositionWithTokens) => void
    onIncreaseLiquidity: (position: PositionWithTokens) => void
}

interface PositionsListProps extends PositionActions {
    onAddLiquidity: () => void
    onUnstake: (stakedPosition: StakedPosition) => void
    refreshNonce: number
}

function PositionCard({
    position,
    stakedPosition,
    onCollectFees,
    onRemoveLiquidity,
    onIncreaseLiquidity,
    onUnstake,
}: {
    position: PositionWithTokens
    stakedPosition?: StakedPosition
    onUnstake: (stakedPosition: StakedPosition) => void
} & PositionActions) {
    const isStaked = !!stakedPosition
    const t0 = getDisplayToken(position.token0Info)
    const t1 = getDisplayToken(position.token1Info)
    const hasFees = position.uncollectedFees0 > 0n || position.uncollectedFees1 > 0n
    const isClosed = position.liquidity === 0n
    const priceLower = tickToPrice(
        position.tickLower,
        position.token0Info.decimals,
        position.token1Info.decimals
    )
    const priceUpper = tickToPrice(
        position.tickUpper,
        position.token0Info.decimals,
        position.token1Info.decimals
    )
    // Full-range positions span the entire min/max tick, so the range bar conveys nothing.
    const isFullRange =
        position.tickLower <= MIN_TICK + FULL_RANGE_TICK_TOLERANCE &&
        position.tickUpper >= MAX_TICK - FULL_RANGE_TICK_TOLERANCE
    return (
        <Card>
            <CardContent className="p-5">
                {/* Header: Pair identity + status */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <TokenIconPair
                            src0={t0.logo}
                            symbol0={t0.symbol}
                            src1={t1.logo}
                            symbol1={t1.symbol}
                            size="md"
                        />
                        <div className="flex items-center gap-2">
                            <span className="text-base font-semibold">
                                {t0.symbol} / {t1.symbol}
                            </span>
                            <Badge variant="outline" className="text-xs">
                                {(position.fee / 10000).toFixed(2)}%
                            </Badge>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {isStaked && (
                            <Badge
                                variant="outline"
                                className="bg-primary/15 text-primary border-primary/30"
                            >
                                <Zap className="mr-1 h-3 w-3" />
                                Staking
                            </Badge>
                        )}
                        {!isStaked &&
                            (isClosed ? (
                                <Badge variant="secondary">Closed</Badge>
                            ) : position.inRange ? (
                                <Badge
                                    variant="outline"
                                    className="bg-positive/15 text-positive border-positive/25"
                                >
                                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-positive" />
                                    In Range
                                </Badge>
                            ) : (
                                <Badge
                                    variant="outline"
                                    className="bg-negative/15 text-negative border-negative/25"
                                >
                                    Out of Range
                                </Badge>
                            ))}
                    </div>
                </div>

                <Separator className="my-4" />

                {/* Data section */}
                <div
                    className={`grid grid-cols-1 gap-4 ${
                        isStaked ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
                    }`}
                >
                    <div className="space-y-2 min-w-0">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Liquidity
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-baseline gap-1 min-w-0">
                                <span className="text-sm font-medium font-mono tracking-tight truncate">
                                    {formatLiquidityAmount(
                                        position.amount0,
                                        position.token0Info.decimals
                                    )}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {t0.symbol}
                                </span>
                            </div>
                            <div className="flex items-baseline gap-1 min-w-0">
                                <span className="text-sm font-medium font-mono tracking-tight truncate">
                                    {formatLiquidityAmount(
                                        position.amount1,
                                        position.token1Info.decimals
                                    )}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {t1.symbol}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2 min-w-0">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Unclaimed Fees
                        </div>
                        {hasFees ? (
                            <div className="space-y-1">
                                <div className="flex items-baseline gap-1 min-w-0">
                                    <span className="text-sm font-bold font-mono tracking-tight truncate">
                                        {formatTokenAmount(
                                            position.uncollectedFees0,
                                            position.token0Info.decimals
                                        )}
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                        {t0.symbol}
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-1 min-w-0">
                                    <span className="text-sm font-bold font-mono tracking-tight truncate">
                                        {formatTokenAmount(
                                            position.uncollectedFees1,
                                            position.token1Info.decimals
                                        )}
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                        {t1.symbol}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-muted-foreground">No fees to collect</div>
                        )}
                    </div>
                    {stakedPosition && (
                        <div className="space-y-2 min-w-0">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Pending Rewards
                            </div>
                            <div className="flex items-baseline gap-1 min-w-0">
                                <span className="text-lg font-bold font-mono tracking-tight truncate">
                                    {formatRewardAmount(
                                        stakedPosition.pendingRewards,
                                        stakedPosition.incentive.rewardTokenInfo.decimals
                                    )}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {stakedPosition.incentive.rewardTokenInfo.symbol}
                                </span>
                            </div>
                        </div>
                    )}
                    <div className="space-y-2 min-w-0">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Price Range
                        </div>
                        {isFullRange ? (
                            <div className="text-sm font-medium font-mono tracking-tight">
                                Full Range
                            </div>
                        ) : (
                            <>
                                <div className="flex items-baseline justify-between gap-2 text-xs">
                                    <span className="font-mono tracking-tight truncate">
                                        {priceLower}
                                    </span>
                                    <span className="font-mono tracking-tight truncate text-muted-foreground">
                                        {priceUpper}
                                    </span>
                                </div>
                                <PriceRangeBar
                                    tickLower={position.tickLower}
                                    tickUpper={position.tickUpper}
                                    currentTick={position.currentTick}
                                    inRange={position.inRange}
                                    segmentInRangeClassName={
                                        isClosed ? 'bg-muted-foreground/30' : undefined
                                    }
                                    segmentOutRangeClassName={
                                        isClosed ? 'bg-muted-foreground/30' : undefined
                                    }
                                />
                            </>
                        )}
                    </div>
                </div>

                {/* Action buttons */}
                <Separator className="my-4" />
                <div className="flex gap-2">
                    {stakedPosition ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={(e) => {
                                e.stopPropagation()
                                onUnstake(stakedPosition)
                            }}
                        >
                            <Unlock className="h-3.5 w-3.5" />
                            Unstake
                        </Button>
                    ) : (
                        <>
                            {hasFees && (
                                <Button
                                    size="sm"
                                    className="flex-1"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onCollectFees(position)
                                    }}
                                >
                                    Collect Fees
                                </Button>
                            )}
                            {!isClosed && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onIncreaseLiquidity(position)
                                    }}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add
                                </Button>
                            )}
                            {!isClosed && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemoveLiquidity(position)
                                    }}
                                >
                                    <Minus className="h-3.5 w-3.5" />
                                    Remove
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

function LoadingState() {
    return (
        <div className="space-y-3">
            {[1, 2, 3].map((i) => (
                <Card key={i}>
                    <CardContent className="p-5">
                        <div className="animate-pulse space-y-4">
                            {/* Header skeleton */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex -space-x-2">
                                        <TokenIconSkeleton size="md" />
                                        <TokenIconSkeleton size="md" />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="h-4 w-28 bg-muted rounded" />
                                    </div>
                                </div>
                                <div className="h-5 w-20 bg-muted rounded-full" />
                            </div>
                            {/* Separator */}
                            <div className="h-[1px] bg-muted" />
                            {/* Data skeleton */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="h-3 w-16 bg-muted rounded" />
                                    <div className="h-4 w-24 bg-muted rounded" />
                                    <div className="h-4 w-20 bg-muted rounded" />
                                </div>
                                <div className="space-y-2">
                                    <div className="h-3 w-20 bg-muted rounded" />
                                    <div className="h-4 w-24 bg-muted rounded" />
                                    <div className="h-4 w-20 bg-muted rounded" />
                                </div>
                            </div>
                            {/* Range bar skeleton */}
                            {/* Separator */}
                            <div className="h-[1px] bg-muted" />
                            {/* Buttons skeleton */}
                            <div className="flex gap-2">
                                <div className="h-8 flex-1 bg-muted rounded" />
                                <div className="h-8 flex-1 bg-muted rounded" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export function PositionsList({
    onAddLiquidity,
    onCollectFees,
    onRemoveLiquidity,
    onIncreaseLiquidity,
    onUnstake,
    refreshNonce,
}: PositionsListProps) {
    const { address } = useAccount()
    const chainId = useChainId()
    const { positions: walletPositions, isLoading: isLoadingWallet } = useUserPositions(
        address,
        chainId
    )
    // refreshNonce makes the hook re-read localStorage after a stake/unstake mutates it;
    // the page invalidates the query cache to refresh the on-chain reads themselves.
    const { tokenIds: stakedTokenIds, isLoading: isLoadingStakedIds } = useDepositedTokenIds(
        address,
        refreshNonce
    )
    const { positions: stakedPositions, isLoading: isLoadingStakedPositions } =
        usePositionsByTokenIds(stakedTokenIds, chainId)

    const incentiveKeys = useMemo(() => KNOWN_INCENTIVES[chainId] ?? [], [chainId])
    const { incentives, isLoading: isLoadingIncentives } = useIncentives(incentiveKeys)
    const { stakedPositions: stakedDetails, isLoading: isLoadingStaked } = useStakedPositions(
        stakedPositions,
        incentives,
        address
    )

    const { rewards: rewardsMap, isLoading: isLoadingRewards } =
        usePendingRewardsMultiple(stakedDetails)

    // tokenId -> enriched StakedPosition (first incentive wins if staked in several)
    const stakedByTokenId = useMemo(() => {
        const map = new Map<string, StakedPosition>()
        for (const sp of stakedDetails) {
            const tokenIdStr = sp.tokenId.toString()
            if (map.has(tokenIdStr)) continue
            const key = `${tokenIdStr}-${sp.incentiveId}`
            map.set(tokenIdStr, { ...sp, pendingRewards: rewardsMap.get(key) ?? 0n })
        }
        return map
    }, [stakedDetails, rewardsMap])

    const allPositions = useMemo(() => {
        const walletIds = new Set(walletPositions.map((p) => p.tokenId.toString()))
        // Only include staked positions not already in wallet list
        const uniqueStaked = stakedPositions.filter((p) => !walletIds.has(p.tokenId.toString()))
        const merged = [...walletPositions, ...uniqueStaked]

        merged.sort((a, b) => {
            const getPriority = (p: PositionWithTokens) => {
                if (stakedByTokenId.has(p.tokenId.toString())) return 0 // Staking first
                if (p.liquidity === 0n) return 3 // Closed last
                return p.inRange ? 1 : 2
            }
            return getPriority(a) - getPriority(b)
        })

        return merged
    }, [walletPositions, stakedPositions, stakedByTokenId])

    const [showClosed, setShowClosed] = useState(false)

    const { active, closed } = useMemo(() => {
        const active: PositionWithTokens[] = []
        const closed: PositionWithTokens[] = []
        for (const p of allPositions) {
            ;(p.liquidity === 0n ? closed : active).push(p)
        }
        return { active, closed }
    }, [allPositions])

    const isLoading =
        isLoadingWallet ||
        isLoadingStakedIds ||
        isLoadingStakedPositions ||
        isLoadingIncentives ||
        isLoadingStaked ||
        isLoadingRewards

    if (!address) {
        return (
            <EmptyState
                title="Connect Wallet"
                description="Connect your wallet to view your liquidity positions."
                action={<ConnectButton />}
            />
        )
    }
    if (isLoading) {
        return <LoadingState />
    }
    if (allPositions.length === 0) {
        return (
            <EmptyState
                title="No liquidity positions"
                description="You don't have any liquidity positions yet."
                action={
                    <Button onClick={() => onAddLiquidity()}>
                        <Plus />
                        Create Position
                    </Button>
                }
            />
        )
    }
    const renderCard = (position: PositionWithTokens) => (
        <PositionCard
            key={position.tokenId.toString()}
            position={position}
            stakedPosition={stakedByTokenId.get(position.tokenId.toString())}
            onCollectFees={onCollectFees}
            onRemoveLiquidity={onRemoveLiquidity}
            onIncreaseLiquidity={onIncreaseLiquidity}
            onUnstake={onUnstake}
        />
    )

    return (
        <div className="space-y-3">
            {active.map(renderCard)}
            {closed.length > 0 && (
                <>
                    <button
                        type="button"
                        onClick={() => setShowClosed((v) => !v)}
                        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {showClosed ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="font-mono">
                            {showClosed ? 'Hide' : 'Show'} {closed.length} closed position
                            {closed.length !== 1 ? 's' : ''}
                        </span>
                    </button>
                    {showClosed && closed.map(renderCard)}
                </>
            )}
        </div>
    )
}
