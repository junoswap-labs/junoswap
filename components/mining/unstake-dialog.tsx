'use client'

import { useEffect, useState } from 'react'
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
import { useUnstakePosition } from '@/hooks/useStaking'
import { usePendingRewards } from '@/hooks/useRewards'
import { formatRewardAmount } from '@/lib/format'
import { formatTimeRemaining } from '@/services/mining/incentives'
import { toastSuccess, toastError } from '@/lib/toast'
import { removeStakedTokenId } from '@/lib/staked-positions-storage'
import type { StakedPosition } from '@/types/earn'

interface UnstakeDialogProps {
    open: boolean
    stakedPosition: StakedPosition | null
    onClose: () => void
    onSuccess?: () => void
}

export function UnstakeDialog({
    open,
    stakedPosition: selectedStakedPosition,
    onClose,
    onSuccess,
}: UnstakeDialogProps) {
    const { address } = useAccount()
    const chainId = useChainId()
    const { position, incentive } = selectedStakedPosition ?? { position: null, incentive: null }
    const { reward: pendingRewards, isLoading: isLoadingRewards } = usePendingRewards(
        incentive,
        position?.tokenId
    )
    const { unstake, isPreparing, isExecuting, isConfirming, isSuccess, error, hash } =
        useUnstakePosition(position?.tokenId, incentive, address, true)
    const [processedTxHash, setProcessedTxHash] = useState<`0x${string}` | null>(null)
    useEffect(() => {
        if (open) setProcessedTxHash(null)
    }, [open])
    // Guard on the tx hash: onClose/onSuccess have unstable identities, so without it
    // this effect re-fires while isSuccess stays true and loops (onSuccess bumps state).
    useEffect(() => {
        if (isSuccess && hash && hash !== processedTxHash) {
            if (address && position) {
                removeStakedTokenId(chainId, address, position.tokenId)
            }
            toastSuccess('Position unstaked successfully!')
            setProcessedTxHash(hash)
            onSuccess?.()
            onClose()
        }
    }, [isSuccess, hash, processedTxHash, onClose, onSuccess, address, chainId, position])
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
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
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
                                        className="bg-positive/10 text-positive border-positive/20"
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
                </div>
                <DialogFooter>
                    <Button size="lg" onClick={unstake} disabled={isLoading}>
                        {getButtonText()}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
