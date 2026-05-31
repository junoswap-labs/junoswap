'use client'

import { useEffect } from 'react'
import { useAccount, useChainId } from 'wagmi'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useEarnStore, useSelectedStakedPosition } from '@/store/earn-store'
import { useUnstakePosition } from '@/hooks/useStaking'
import { usePendingRewards } from '@/hooks/useRewards'
import { formatRewardAmount } from '@/lib/format'
import { formatTimeRemaining } from '@/services/mining/incentives'
import { toastSuccess, toastError } from '@/lib/toast'
import { removeStakedTokenId } from '@/lib/staked-positions-storage'

export function UnstakeDialog() {
    const { address } = useAccount()
    const chainId = useChainId()
    const { isUnstakeDialogOpen, closeUnstakeDialog } = useEarnStore()
    const selectedStakedPosition = useSelectedStakedPosition()
    const { position, incentive } = selectedStakedPosition ?? { position: null, incentive: null }
    const { reward: pendingRewards, isLoading: isLoadingRewards } = usePendingRewards(
        incentive,
        position?.tokenId
    )
    const { unstake, isPreparing, isExecuting, isConfirming, isSuccess, error, hash } =
        useUnstakePosition(position?.tokenId, incentive, address, true)
    useEffect(() => {
        if (isSuccess && hash) {
            if (address && position) {
                removeStakedTokenId(chainId, address, position.tokenId)
            }
            toastSuccess('Position unstaked successfully!')
            closeUnstakeDialog()
        }
    }, [isSuccess, hash, closeUnstakeDialog, address, chainId, position])
    useEffect(() => {
        if (error) {
            toastError(error)
        }
    }, [error])
    if (!selectedStakedPosition || !position || !incentive) return null
    const isLoading = isPreparing || isExecuting || isConfirming
    const getButtonText = () => {
        if (isPreparing) return 'Preparing...'
        if (isExecuting) return 'Confirm in wallet...'
        if (isConfirming) return 'Unstaking...'
        return 'Unstake & Claim'
    }
    const formattedRewards = formatRewardAmount(pendingRewards, incentive.rewardTokenInfo.decimals)
    return (
        <Dialog open={isUnstakeDialogOpen} onOpenChange={closeUnstakeDialog}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Unstake Position</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                    <div className="text-center">
                        <div className="text-lg font-medium">
                            {position.token0Info.symbol} / {position.token1Info.symbol}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Position #{position.tokenId.toString()}
                        </div>
                    </div>
                    <div className="bg-muted rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Mining Pool</span>
                            <div className="flex items-center gap-2">
                                <span className="font-medium">
                                    {incentive.poolToken0.symbol} / {incentive.poolToken1.symbol}
                                </span>
                                {incentive.isActive ? (
                                    <Badge
                                        variant="outline"
                                        className="bg-green-500/10 text-green-500 border-green-500/20"
                                    >
                                        Active
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                        Ended
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Time Remaining</span>
                            <span className="font-medium">
                                {formatTimeRemaining(incentive.endTime)}
                            </span>
                        </div>
                    </div>
                    <div className="bg-primary/10 rounded-lg p-4">
                        <div className="text-sm text-muted-foreground mb-1">Pending Rewards</div>
                        <div className="text-2xl font-bold">
                            {isLoadingRewards ? (
                                <span className="text-muted-foreground">Loading...</span>
                            ) : (
                                <>
                                    {formattedRewards} {incentive.rewardTokenInfo.symbol}
                                </>
                            )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                            Will be claimed automatically when you unstake
                        </div>
                    </div>
                    {incentive.isActive && (
                        <div className="text-sm text-yellow-600 bg-yellow-500/10 rounded-lg p-3">
                            This incentive is still active. If you unstake now, you will stop
                            earning rewards.
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        size="lg"
                        onClick={unstake}
                        disabled={isLoading}
                        variant={incentive.isActive ? 'destructive' : 'default'}
                    >
                        {getButtonText()}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
