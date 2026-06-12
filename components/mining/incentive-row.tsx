'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TokenIconPair } from '@/components/ui/token-icon'
import { TableCell, TableRow } from '@/components/ui/table'
import { ConnectModal } from '@/components/web3/connect-modal'
import { formatTokenAmount } from '@/services/tokens'
import {
    formatTimeRemaining,
    getIncentiveProgress,
    getIncentiveStatus,
} from '@/services/mining/incentives'
import type { Incentive } from '@/types/earn'

interface IncentiveRowProps {
    incentive: Incentive
    onStake: (incentive: Incentive) => void
}

export function IncentiveRow({ incentive, onStake }: IncentiveRowProps) {
    const { isConnected } = useAccount()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
    const status = getIncentiveStatus(incentive)
    const progress = getIncentiveProgress(incentive.startTime, incentive.endTime)
    const timeRemaining = formatTimeRemaining(incentive.endTime)
    const formattedReward = formatTokenAmount(
        incentive.totalRewardUnclaimed,
        incentive.rewardTokenInfo.decimals
    )

    const statusColor =
        status === 'active'
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
            : status === 'pending'
              ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
              : 'bg-gray-500/10 text-gray-500 border-gray-500/20'

    const statusLabel = status === 'active' ? 'Active' : status === 'pending' ? 'Upcoming' : 'Ended'

    const getButtonLabel = () => {
        if (!isConnected) return 'Connect'
        if (status === 'active') return 'Stake'
        if (status === 'pending') return 'Soon'
        return 'Ended'
    }

    return (
        <TableRow>
            {/* Pool */}
            <TableCell>
                <div className="flex items-center gap-3">
                    <TokenIconPair
                        src0={incentive.poolToken0.logo}
                        symbol0={incentive.poolToken0.symbol}
                        src1={incentive.poolToken1.logo}
                        symbol1={incentive.poolToken1.symbol}
                        size="sm"
                    />
                    <div className="flex items-center gap-2">
                        <span className="font-medium">
                            {incentive.poolToken0.symbol} / {incentive.poolToken1.symbol}
                        </span>
                        <Badge variant="outline" className="text-xs">
                            {(incentive.poolFee / 10000).toFixed(2)}%
                        </Badge>
                    </div>
                </div>
            </TableCell>

            {/* Reward Token (hidden on mobile) */}
            <TableCell className="hidden md:table-cell">
                <span className="text-sm text-muted-foreground">
                    {incentive.rewardTokenInfo.symbol}
                </span>
            </TableCell>

            {/* Remaining Rewards */}
            <TableCell>
                <div>
                    <span className="text-sm font-medium font-mono tracking-tight">
                        {formattedReward}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                        {incentive.rewardTokenInfo.symbol}
                    </span>
                </div>
            </TableCell>

            {/* Stakers (hidden on mobile) */}
            <TableCell className="hidden md:table-cell">
                <span className="text-sm">{incentive.numberOfStakes}</span>
            </TableCell>

            {/* Time */}
            <TableCell>
                <span className="text-sm">{timeRemaining}</span>
            </TableCell>

            {/* Status / Progress */}
            <TableCell>
                {status === 'active' ? (
                    <div className="w-20">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 text-right">
                            {progress}%
                        </div>
                    </div>
                ) : (
                    <Badge variant="outline" className={statusColor}>
                        {statusLabel}
                    </Badge>
                )}
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        if (!isConnected) {
                            setIsConnectModalOpen(true)
                            return
                        }
                        onStake(incentive)
                    }}
                    disabled={status === 'ended'}
                >
                    {getButtonLabel()}
                </Button>
                <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
            </TableCell>
        </TableRow>
    )
}
