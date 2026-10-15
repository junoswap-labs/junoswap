'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount, useChainId } from 'wagmi'
import { ArrowLeft, Droplets, Share2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { TokenIconPair } from '@/components/ui/token-icon'
import { ConnectModal } from '@/components/web3/connect-modal'
import { AddressRow } from '@/components/earn/staking-pools'
import { AddLiquidityDialog } from '@/components/positions/add-liquidity-dialog'
import { FarmStatusBadge, ProgramMark } from './farm-status-badge'
import { StakeDialog } from './stake-dialog'
import { UnstakeDialog } from './unstake-dialog'
import { useIncentives } from '@/hooks/useIncentives'
import { useIncentiveRewardValues } from '@/hooks/useIncentiveRewardValues'
import { useFarmStats } from '@/hooks/useFarmStats'
import { useFarmStakes, toStakedPosition } from '@/hooks/useFarmStakes'
import { useStakerDeposits } from '@/hooks/useStakerDeposits'
import { usePendingRewardsMultiple } from '@/hooks/useRewards'
import { useNowSeconds } from '@/hooks/useNowSeconds'
import { getStakerAddress } from '@/lib/earn-programs'
import { formatAprPercent, formatRewardAmount, formatTvl } from '@/lib/format'
import { formatFeeTier } from '@/lib/liquidity-helpers'
import { formatBalance, formatTokenAmount, getDisplayToken } from '@/lib/tokens'
import { toastSuccess } from '@/lib/toast'
import { formatAddress } from '@/lib/utils'
import { getChainMetadata } from '@/lib/wagmi'
import { getFarmStatusAt } from '@/services/mining/farm-list'
import { incentiveToPoolData } from '@/services/mining/incentives'
import type { StakedPosition } from '@/types/earn'

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
            <div className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</div>
            {sub && <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>}
        </div>
    )
}

const formatDate = (seconds: number) =>
    new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** The shareable full-screen view of one LP farm: its terms, its numbers, and the viewer's stake. */
export function FarmDetail({ incentiveId }: { incentiveId: string }) {
    const { address: account, isConnected } = useAccount()
    const chainId = useChainId()
    const now = useNowSeconds()
    const { incentives, isLoading, refetch: refetchIncentives } = useIncentives()
    const incentive = incentives.find(
        (i) => i.incentiveId.toLowerCase() === incentiveId.toLowerCase()
    )
    const farmList = useMemo(() => (incentive ? [incentive] : []), [incentive])
    const { valueByIncentiveId } = useIncentiveRewardValues(farmList)
    const { statsByIncentiveId } = useFarmStats(farmList, valueByIncentiveId)

    const { deposits, refetch: refetchDeposits } = useStakerDeposits()
    const { stakes } = useFarmStakes(farmList, deposits)
    const owner = account?.toLowerCase()
    const myStaked = useMemo(
        () => stakes.filter((s) => s.depositor.toLowerCase() === owner).map(toStakedPosition),
        [stakes, owner]
    )
    const { rewards } = usePendingRewardsMultiple(myStaked)

    const [isStakeOpen, setIsStakeOpen] = useState(false)
    const [isAddLiquidityOpen, setIsAddLiquidityOpen] = useState(false)
    const [isConnectOpen, setIsConnectOpen] = useState(false)
    const [unstaking, setUnstaking] = useState<StakedPosition | null>(null)
    const refresh = () => {
        refetchIncentives()
        refetchDeposits()
    }

    if (isLoading) return <div className="h-64 animate-pulse rounded-3xl bg-muted/20" />
    if (!incentive) {
        return (
            <EmptyState
                title="Farm not found"
                description="This farm does not exist on the connected network."
            />
        )
    }

    const status = getFarmStatusAt(incentive, now)
    const token0 = getDisplayToken(incentive.poolToken0)
    const token1 = getDisplayToken(incentive.poolToken1)
    const rewardToken = getDisplayToken(incentive.rewardTokenInfo)
    const stats = statsByIncentiveId[incentive.incentiveId]
    const isOwner = !!owner && incentive.refundee.toLowerCase() === owner
    const remaining = parseFloat(
        formatTokenAmount(incentive.totalRewardUnclaimed, incentive.rewardTokenInfo.decimals)
    )
    const remainingUsd = valueByIncentiveId[incentive.incentiveId]
    const span = incentive.endTime - incentive.startTime
    const progress =
        span > 0 ? Math.min(100, Math.max(0, ((now - incentive.startTime) / span) * 100)) : 0
    const timeLeft =
        status === 'active'
            ? `Ends ${formatDate(incentive.endTime)}`
            : status === 'pending'
              ? `Starts ${formatDate(incentive.startTime)}`
              : `Ended ${formatDate(incentive.endTime)}`
    // An ended farm has nothing to join; only whoever made it or is still staked in it has business here.
    const canJoin = status === 'active'
    const staker = getStakerAddress(chainId, incentive.program)

    return (
        <div className="space-y-6">
            <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                        <TokenIconPair
                            src0={token0.logo}
                            symbol0={token0.symbol}
                            src1={token1.logo}
                            symbol1={token1.symbol}
                            size="lg"
                            className="shrink-0"
                        />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                                    {token0.symbol} / {token1.symbol}
                                </h1>
                                <Badge variant="outline">{formatFeeTier(incentive.poolFee)}</Badge>
                                <FarmStatusBadge status={status} />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                                <span>Earn {rewardToken.symbol}</span>
                                <span>·</span>
                                <ProgramMark program={incentive.program} />
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                                Created by{' '}
                                <a
                                    href={`${getChainMetadata(chainId).explorer}/address/${incentive.refundee}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={incentive.refundee}
                                    className="font-mono hover:text-foreground"
                                >
                                    {formatAddress(incentive.refundee)}
                                </a>
                                {isOwner && ' (you)'}
                            </div>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="shrink-0 self-start sm:self-center"
                        onClick={() => {
                            navigator.clipboard.writeText(window.location.href)
                            toastSuccess('Link copied')
                        }}
                    >
                        <Share2 />
                        Share
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile
                    label="APR"
                    value={formatAprPercent(stats?.aprPercent ?? null)}
                    sub={incentive.numberOfStakes === 0 ? 'no stakers yet' : undefined}
                />
                <Tile
                    label="Staked TVL"
                    value={stats?.stakedTvlUsd === undefined ? '—' : formatTvl(stats.stakedTvlUsd)}
                    sub={`${incentive.numberOfStakes} position${incentive.numberOfStakes === 1 ? '' : 's'}`}
                />
                <Tile
                    label="Remaining"
                    value={`${remaining.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${rewardToken.symbol}`}
                    sub={remainingUsd === undefined ? undefined : formatTvl(remainingUsd)}
                />
                <Tile
                    label="Status"
                    value={
                        status === 'active'
                            ? 'Running'
                            : status === 'pending'
                              ? 'Scheduled'
                              : 'Ended'
                    }
                    sub={timeLeft}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                <div className="space-y-6">
                    <Card>
                        <CardContent className="space-y-4 p-5">
                            <div className="flex items-baseline justify-between">
                                <h2 className="font-semibold">Schedule</h2>
                                <span className="text-sm text-muted-foreground">
                                    {status === 'ended' ? '100%' : `${Math.round(progress)}%`}
                                </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${status === 'ended' ? 100 : progress}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{formatDate(incentive.startTime)}</span>
                                <span>{formatDate(incentive.endTime)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-5">
                            <h2 className="mb-1 font-semibold">Contracts</h2>
                            <div className="divide-y divide-border/50">
                                <AddressRow
                                    label="Pool"
                                    address={incentive.pool}
                                    chainId={chainId}
                                />
                                <AddressRow
                                    label={`${rewardToken.symbol} (reward)`}
                                    address={incentive.rewardToken}
                                    chainId={chainId}
                                />
                                {staker && (
                                    <AddressRow label="Staker" address={staker} chainId={chainId} />
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="h-fit lg:sticky lg:top-24">
                    <CardContent className="space-y-5 p-5">
                        <h2 className="font-semibold">Your stake</h2>
                        {myStaked.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {isConnected
                                    ? 'You have no position staked in this farm.'
                                    : 'Connect a wallet to see your stake.'}
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {myStaked.map((sp) => {
                                    const key = `${sp.tokenId.toString()}-${sp.incentiveId}`
                                    const { position } = sp
                                    return (
                                        <div
                                            key={key}
                                            className="rounded-xl border border-border/50 p-3 text-sm"
                                        >
                                            <div className="flex items-baseline justify-between gap-2">
                                                <span className="font-medium">
                                                    #{sp.tokenId.toString()}
                                                </span>
                                                <span className="font-mono text-xs text-positive">
                                                    {formatRewardAmount(
                                                        rewards.get(key) ?? 0n,
                                                        incentive.rewardTokenInfo.decimals
                                                    )}{' '}
                                                    {rewardToken.symbol}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {formatBalance(
                                                    position.amount0,
                                                    position.token0Info.decimals
                                                )}{' '}
                                                {token0.symbol} +{' '}
                                                {formatBalance(
                                                    position.amount1,
                                                    position.token1Info.decimals
                                                )}{' '}
                                                {token1.symbol}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="mt-3 w-full"
                                                onClick={() => setUnstaking(sp)}
                                            >
                                                Unstake &amp; Claim
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        {(canJoin || !isConnected) && status !== 'ended' && (
                            <div className="flex flex-col gap-2">
                                <Button
                                    onClick={() =>
                                        isConnected ? setIsStakeOpen(true) : setIsConnectOpen(true)
                                    }
                                    disabled={isConnected && !canJoin}
                                >
                                    {!isConnected ? 'Connect Wallet' : canJoin ? 'Stake' : 'Soon'}
                                </Button>
                                {isConnected && (
                                    <Button
                                        variant="outline"
                                        onClick={() => setIsAddLiquidityOpen(true)}
                                    >
                                        <Droplets />
                                        Add liquidity
                                    </Button>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <StakeDialog
                open={isStakeOpen}
                incentive={incentive}
                onClose={() => setIsStakeOpen(false)}
                onAddLiquidity={() => setIsAddLiquidityOpen(true)}
                onSuccess={refresh}
            />
            <UnstakeDialog
                open={unstaking !== null}
                stakedPosition={unstaking}
                onClose={() => setUnstaking(null)}
                onSuccess={refresh}
            />
            <AddLiquidityDialog
                open={isAddLiquidityOpen}
                initialPool={incentiveToPoolData(incentive)}
                onClose={() => setIsAddLiquidityOpen(false)}
                onSuccess={refresh}
            />
            <ConnectModal open={isConnectOpen} onOpenChange={setIsConnectOpen} />
        </div>
    )
}

export function FarmBackLink() {
    return (
        <Link
            href="/earn?tab=lp-farming"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
            <ArrowLeft className="h-4 w-4" />
            All farms
        </Link>
    )
}
