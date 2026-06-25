'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { TokenIcon, TokenIconPair } from '@/components/ui/token-icon'
import { ConnectModal } from '@/components/web3/connect-modal'
import { formatTokenAmount, getDisplayToken } from '@/services/tokens'
import { useTokenPriceMap } from '@/hooks/use-token-price-map'
import {
    formatTimeRemaining,
    getIncentiveProgress,
    getIncentiveStatus,
} from '@/services/mining/incentives'
import type { Incentive } from '@/types/earn'

interface MiningFarmCardProps {
    incentive: Incentive
    onStake: (incentive: Incentive) => void
}

function formatUsd(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000)
        return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `$${value.toFixed(2)}`
}

export function MiningFarmCard({ incentive, onStake }: MiningFarmCardProps) {
    const { isConnected } = useAccount()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)

    const poolToken0 = getDisplayToken(incentive.poolToken0)
    const poolToken1 = getDisplayToken(incentive.poolToken1)
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
        status === 'active' ? timeRemaining : status === 'pending' ? 'Upcoming' : 'Ended'
    const barFillStyle = isEnded
        ? undefined
        : { background: 'linear-gradient(90deg, hsl(var(--primary) / 0.3), hsl(var(--primary)))' }
    const barFillClassName = isEnded
        ? 'h-full rounded-full bg-muted-foreground/25 transition-all duration-300'
        : 'h-full rounded-full transition-all duration-300'

    const isDisabled = status === 'ended' || status === 'pending'
    const buttonLabel = !isConnected
        ? 'Connect Wallet'
        : status === 'active'
          ? 'Stake'
          : status === 'pending'
            ? 'Soon'
            : 'Ended'

    return (
        <Card className="position-card-hover flex flex-col">
            <CardContent className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <TokenIconPair
                            src0={poolToken0.logo}
                            symbol0={poolToken0.symbol}
                            src1={poolToken1.logo}
                            symbol1={poolToken1.symbol}
                            size="md"
                        />
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                    {poolToken0.symbol} / {poolToken1.symbol}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                    {(incentive.poolFee / 10000).toFixed(2)}%
                                </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <span>Earn</span>
                                <TokenIcon
                                    src={rewardToken.logo}
                                    symbol={rewardToken.symbol}
                                    size="xs"
                                />
                                <span>{rewardToken.symbol}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <Separator className="my-4" />

                <div className="flex flex-col flex-1 gap-4">
                    <div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Remaining
                        </div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="text-base font-bold font-mono tracking-tight">
                                {rewardAmount}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {rewardToken.symbol}
                            </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                            {rewardValueUsd !== null ? formatUsd(rewardValueUsd) : '—'}
                        </div>
                    </div>

                    <div className="mt-auto">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{barLabel}</span>
                            <span className="tabular-nums">
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

                <Button
                    className="w-full mt-4"
                    variant={isDisabled ? 'outline' : 'default'}
                    disabled={isDisabled}
                    onClick={() => {
                        if (!isConnected) {
                            setIsConnectModalOpen(true)
                            return
                        }
                        onStake(incentive)
                    }}
                >
                    {buttonLabel}
                </Button>
            </CardContent>
            <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
        </Card>
    )
}
