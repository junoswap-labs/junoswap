'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Droplets, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConnectModal } from '@/components/web3/connect-modal'
import { FarmIdentity, FarmStatusBadge, ProgramMark } from './farm-status-badge'
import { formatTokenAmount, getDisplayToken } from '@/lib/tokens'
import { formatAprPercent, formatTvl } from '@/lib/format'
import { useTokenPriceMap } from '@/hooks/useTokenPriceMap'
import {
    formatTimeRemaining,
    formatTimeUntilStart,
    getIncentiveProgress,
    getIncentiveStatus,
} from '@/services/mining/incentives'
import type { FarmStats } from '@/hooks/useFarmStats'
import type { Incentive } from '@/types/earn'

interface MiningFarmCardProps {
    incentive: Incentive
    stats?: FarmStats
    onStake: (incentive: Incentive) => void
    onUnstake: (incentive: Incentive) => void
    onAddLiquidity: (incentive: Incentive) => void
    /** False hides the whole action row, e.g. an ended farm the viewer has no stake in. */
    showActions?: boolean
    /** Set when the viewer is still staked in an ended farm: replaces the dead "Ended" button. */
    unclaimed?: string
}

function formatUsd(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000)
        return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `$${value.toFixed(2)}`
}

function Metric({
    label,
    value,
    sub,
    accent,
}: {
    label: string
    value: string
    sub?: string
    accent?: boolean
}) {
    return (
        <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
            <div
                className={`mt-1 truncate text-base font-bold tracking-tight ${
                    accent ? 'text-positive' : ''
                }`}
            >
                {value}
            </div>
            {sub && (
                <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{sub}</div>
            )}
        </div>
    )
}

export function MiningFarmCard({
    incentive,
    stats,
    onStake,
    onUnstake,
    onAddLiquidity,
    showActions = true,
    unclaimed,
}: MiningFarmCardProps) {
    const { isConnected } = useAccount()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)

    const rewardToken = getDisplayToken(incentive.rewardTokenInfo)

    const status = getIncentiveStatus(incentive)
    const progress = getIncentiveProgress(incentive.startTime, incentive.endTime)
    const timeRemaining = formatTimeRemaining(incentive.endTime)
    const { priceMap } = useTokenPriceMap(incentive.rewardTokenInfo.chainId)
    const rewardValueNum = parseFloat(
        formatTokenAmount(incentive.totalRewardUnclaimed, incentive.rewardTokenInfo.decimals)
    )
    const rewardAmount = rewardValueNum.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
    const rewardPriceUsd = priceMap.get(incentive.rewardTokenInfo.address.toLowerCase())
    const rewardValueUsd =
        rewardPriceUsd !== undefined && !Number.isNaN(rewardValueNum)
            ? rewardPriceUsd * rewardValueNum
            : null

    const isEnded = status === 'ended'
    const barWidth = isEnded ? 100 : progress
    const barLabel =
        status === 'active'
            ? timeRemaining
            : status === 'pending'
              ? formatTimeUntilStart(incentive.startTime)
              : 'Ended'
    const barFillStyle = isEnded
        ? undefined
        : { background: 'linear-gradient(90deg, hsl(var(--primary) / 0.3), hsl(var(--primary)))' }
    const barFillClassName = isEnded
        ? 'h-full rounded-full bg-muted-foreground/25 transition-all duration-300'
        : 'h-full rounded-full transition-all duration-300'

    const isDisabled = (status === 'ended' && !unclaimed) || status === 'pending'
    const buttonLabel = !isConnected
        ? 'Connect Wallet'
        : status === 'active'
          ? 'Stake'
          : status === 'pending'
            ? 'Soon'
            : (unclaimed ?? 'Ended')

    return (
        <Card className="position-card-hover flex flex-col overflow-hidden">
            <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                    <FarmIdentity incentive={incentive} expandable />
                    <FarmStatusBadge status={status} />
                </div>

                <Separator className="my-4" />

                <div className="flex flex-1 flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Metric
                            label="APR"
                            value={formatAprPercent(stats?.aprPercent)}
                            sub={
                                stats?.aprPercent === undefined && incentive.numberOfStakes === 0
                                    ? 'no stakers yet'
                                    : undefined
                            }
                            accent={stats?.aprPercent !== undefined}
                        />
                        <Metric
                            label="Staked TVL"
                            value={
                                stats?.stakedTvlUsd === undefined
                                    ? '—'
                                    : formatTvl(stats.stakedTvlUsd)
                            }
                            sub={`${incentive.numberOfStakes} position${
                                incentive.numberOfStakes === 1 ? '' : 's'
                            }`}
                        />
                    </div>

                    <Metric
                        label="Remaining"
                        value={`${rewardAmount} ${rewardToken.symbol}`}
                        sub={rewardValueUsd !== null ? formatUsd(rewardValueUsd) : '—'}
                    />

                    <div className="mt-auto">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="flex min-w-0 items-center gap-1.5">
                                <ProgramMark program={incentive.program} />
                                <span className="text-muted-foreground/40">·</span>
                                <span className="truncate">{barLabel}</span>
                            </span>
                            <span className="shrink-0 tabular-nums">
                                {isEnded ? '100%' : `${progress}%`}
                            </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                                className={barFillClassName}
                                style={{ width: `${barWidth}%`, ...barFillStyle }}
                            />
                        </div>
                    </div>
                </div>

                {showActions && (
                    <div className="mt-4 flex gap-2">
                        <Button
                            className="flex-1"
                            variant={isDisabled ? 'outline' : 'default'}
                            disabled={isDisabled}
                            onClick={() => {
                                if (!isConnected) {
                                    setIsConnectModalOpen(true)
                                    return
                                }
                                if (unclaimed) onUnstake(incentive)
                                else onStake(incentive)
                            }}
                        >
                            {buttonLabel}
                        </Button>
                        {isConnected && (
                            <Button
                                variant="outline"
                                size="icon"
                                className="shrink-0"
                                title="Unstake &amp; claim"
                                aria-label="Unstake from this farm"
                                onClick={() => onUnstake(incentive)}
                            >
                                <Minus />
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            title="Add liquidity to this pool"
                            aria-label="Add liquidity to this pool"
                            onClick={() => {
                                if (!isConnected) {
                                    setIsConnectModalOpen(true)
                                    return
                                }
                                onAddLiquidity(incentive)
                            }}
                        >
                            <Droplets />
                        </Button>
                    </div>
                )}
            </CardContent>
            <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
        </Card>
    )
}
