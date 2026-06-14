'use client'

import { useMemo } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Minus, Plus, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TokenIconPair, TokenIconSkeleton } from '@/components/ui/token-icon'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { ConnectButton } from '@/components/web3/connect-button'
import { useUserPositions, usePositionsByTokenIds } from '@/hooks/useUserPositions'
import { useDepositedTokenIds } from '@/hooks/useDepositedTokenIds'
import { useEarnStore, useEarnSettings } from '@/store/earn-store'
import { formatTokenAmount } from '@/services/tokens'
import { formatLiquidityAmount } from '@/lib/format'
import type { PositionWithTokens } from '@/types/earn'

function PositionCard({
    position,
    isStaked = false,
}: {
    position: PositionWithTokens
    isStaked?: boolean
}) {
    const {
        openPositionDetails,
        openCollectFees,
        openRemoveLiquidity,
        openIncreaseLiquidity,
        setActiveTab,
    } = useEarnStore()
    const hasFees = position.tokensOwed0 > 0n || position.tokensOwed1 > 0n
    const isClosed = position.liquidity === 0n
    return (
        <Card
            className="cursor-pointer position-card-hover"
            onClick={() => openPositionDetails(position)}
        >
            <CardContent className="p-5">
                {/* Header: Pair identity + status */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <TokenIconPair
                            src0={position.token0Info.logo}
                            symbol0={position.token0Info.symbol}
                            src1={position.token1Info.logo}
                            symbol1={position.token1Info.symbol}
                            size="md"
                        />
                        <div className="flex items-center gap-2">
                            <span className="text-base font-semibold">
                                {position.token0Info.symbol} / {position.token1Info.symbol}
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
                                className="bg-violet-500/15 text-violet-400 border-violet-500/25"
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
                                    className="bg-amber-500/15 text-amber-400 border-amber-500/25"
                                >
                                    Out of Range
                                </Badge>
                            ))}
                    </div>
                </div>

                <Separator className="my-4" />

                {/* Data section */}
                {!isClosed && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                        {position.token0Info.symbol}
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
                                        {position.token1Info.symbol}
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
                                        <span className="text-sm font-medium font-mono tracking-tight text-positive truncate">
                                            {formatTokenAmount(
                                                position.tokensOwed0,
                                                position.token0Info.decimals
                                            )}
                                        </span>
                                        <span className="text-xs text-muted-foreground shrink-0">
                                            {position.token0Info.symbol}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-1 min-w-0">
                                        <span className="text-sm font-medium font-mono tracking-tight text-positive truncate">
                                            {formatTokenAmount(
                                                position.tokensOwed1,
                                                position.token1Info.decimals
                                            )}
                                        </span>
                                        <span className="text-xs text-muted-foreground shrink-0">
                                            {position.token1Info.symbol}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground">
                                    No fees to collect
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {isClosed && (
                    <div className="text-sm text-muted-foreground">
                        Position has been closed. You may still have unclaimed fees.
                    </div>
                )}

                {/* Action buttons */}
                <Separator className="my-4" />
                <div className="flex gap-2">
                    {isStaked ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={(e) => {
                                e.stopPropagation()
                                setActiveTab('mining')
                            }}
                        >
                            <Zap className="h-3.5 w-3.5" />
                            Manage Staking
                        </Button>
                    ) : (
                        <>
                            {hasFees && (
                                <Button
                                    size="sm"
                                    className="flex-1"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        openCollectFees(position)
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
                                        openIncreaseLiquidity(position)
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
                                        openRemoveLiquidity(position)
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

export function PositionsList() {
    const { address } = useAccount()
    const chainId = useChainId()
    const { positions: walletPositions, isLoading: isLoadingWallet } = useUserPositions(
        address,
        chainId
    )
    const { tokenIds: stakedTokenIds, isLoading: isLoadingStakedIds } =
        useDepositedTokenIds(address)
    const { positions: stakedPositions, isLoading: isLoadingStakedPositions } =
        usePositionsByTokenIds(stakedTokenIds, chainId)
    const { openAddLiquidity } = useEarnStore()
    const settings = useEarnSettings()

    const stakedTokenIdSet = useMemo(
        () => new Set(stakedTokenIds.map((id) => id.toString())),
        [stakedTokenIds]
    )

    const { allPositions, stakedSet } = useMemo(() => {
        const walletIds = new Set(walletPositions.map((p) => p.tokenId.toString()))
        // Only include staked positions not already in wallet list
        const uniqueStaked = stakedPositions.filter((p) => !walletIds.has(p.tokenId.toString()))
        const merged = [...walletPositions, ...uniqueStaked]
        const staked = stakedTokenIdSet

        const filtered = settings.hideClosedPositions
            ? merged.filter((p) => p.liquidity > 0n || staked.has(p.tokenId.toString()))
            : merged

        filtered.sort((a, b) => {
            const getPriority = (p: PositionWithTokens) => {
                if (staked.has(p.tokenId.toString())) return 0 // Staking first
                if (p.liquidity === 0n) return 3 // Closed last
                return p.inRange ? 1 : 2
            }
            return getPriority(a) - getPriority(b)
        })

        return { allPositions: filtered, stakedSet: staked }
    }, [walletPositions, stakedPositions, stakedTokenIdSet, settings.hideClosedPositions])

    const isLoading = isLoadingWallet || isLoadingStakedIds || isLoadingStakedPositions

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
                    <Button onClick={() => openAddLiquidity()}>
                        <Plus />
                        Create Position
                    </Button>
                }
            />
        )
    }
    return (
        <div className="space-y-3">
            {allPositions.map((position) => (
                <PositionCard
                    key={position.tokenId.toString()}
                    position={position}
                    isStaked={stakedSet.has(position.tokenId.toString())}
                />
            ))}
        </div>
    )
}
