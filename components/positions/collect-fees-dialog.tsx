'use client'

import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useCollectFees } from '@/hooks/useLiquidity'
import { formatTokenAmount } from '@/services/tokens'
import { toastSuccess, toastError } from '@/lib/toast'
import type { PositionWithTokens } from '@/types/earn'

interface CollectFeesDialogProps {
    open: boolean
    position: PositionWithTokens | null
    onClose: () => void
}

export function CollectFeesDialog({
    open,
    position: selectedPosition,
    onClose,
}: CollectFeesDialogProps) {
    const { address } = useAccount()
    const {
        collect,
        hasFees,
        fees0,
        fees1,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        error,
        hash,
    } = useCollectFees(selectedPosition, address)
    useEffect(() => {
        if (isSuccess && hash) {
            toastSuccess('Fees collected successfully!')
            onClose()
        }
    }, [isSuccess, hash, onClose])
    useEffect(() => {
        if (error) {
            toastError(error)
        }
    }, [error])
    if (!selectedPosition) return null
    const isLoading = isPreparing || isExecuting || isConfirming
    const getButtonText = () => {
        if (isPreparing) return 'Preparing...'
        if (isExecuting) return 'Confirm in wallet...'
        if (isConfirming) return 'Collecting fees...'
        return 'Collect Fees'
    }
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Collect Fees</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                    <div className="text-center">
                        <div className="text-lg font-medium">
                            {selectedPosition.token0Info.symbol} /{' '}
                            {selectedPosition.token1Info.symbol}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Position #{selectedPosition.tokenId.toString()}
                        </div>
                    </div>
                    <div className="bg-muted rounded-lg p-4 space-y-3">
                        <div className="text-sm text-muted-foreground">Fees to collect:</div>
                        <div className="flex justify-between items-center">
                            <span className="font-medium">
                                {selectedPosition.token0Info.symbol}
                            </span>
                            <span className="text-lg font-bold">
                                {formatTokenAmount(fees0, selectedPosition.token0Info.decimals)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="font-medium">
                                {selectedPosition.token1Info.symbol}
                            </span>
                            <span className="text-lg font-bold">
                                {formatTokenAmount(fees1, selectedPosition.token1Info.decimals)}
                            </span>
                        </div>
                    </div>
                    {!hasFees && (
                        <EmptyState title="No fees to collect at this time." className="py-2" />
                    )}
                </div>
                <DialogFooter>
                    <Button size="lg" onClick={collect} disabled={isLoading || !hasFees}>
                        {getButtonText()}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
