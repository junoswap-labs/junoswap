'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useChainId } from 'wagmi'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useEarnStore } from '@/store/earn-store'
import { useRemoveLiquidity } from '@/hooks/useLiquidity'
import { useUserPositions, usePositionDetails } from '@/hooks/useUserPositions'
import { formatTokenAmount } from '@/services/tokens'
import { toastError } from '@/lib/toast'
import { toast } from 'sonner'
import { getChainMetadata } from '@/lib/wagmi'

const PERCENTAGE_OPTIONS = [25, 50, 75, 100]

export function RemoveLiquidityDialog() {
    const { address } = useAccount()
    const chainId = useChainId()
    const {
        isRemoveLiquidityOpen,
        closeRemoveLiquidity,
        selectedPosition: storePosition,
    } = useEarnStore()
    const [percentage, setPercentage] = useState(100)
    const { refetch: refetchPositions } = useUserPositions(address, undefined)
    const { position: selectedPosition } = usePositionDetails(storePosition?.tokenId, undefined)
    const handledHashRef = useRef<string | null>(null)
    const {
        remove,
        liquidityToRemove,
        amount0Min,
        amount1Min,
        isSimulating,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        error,
        simulationError,
        hash,
    } = useRemoveLiquidity(
        selectedPosition,
        percentage,
        address,
        50, // 0.5% slippage
        20 // 20 min deadline
    )
    useEffect(() => {
        if (isSuccess && hash && hash !== handledHashRef.current) {
            handledHashRef.current = hash
            const meta = getChainMetadata(chainId)
            const explorerUrl = meta?.explorer
                ? `${meta.explorer}/tx/${hash}`
                : `https://etherscan.io/tx/${hash}`
            toast.success('Liquidity removed successfully!', {
                action: {
                    label: 'View Transaction',
                    onClick: () => window.open(explorerUrl, '_blank', 'noopener,noreferrer'),
                },
            })
            refetchPositions()
            closeRemoveLiquidity()
            setPercentage(100)
        }
    }, [isSuccess, hash, chainId, closeRemoveLiquidity, refetchPositions])
    useEffect(() => {
        if (error) {
            toastError(error)
        }
    }, [error])
    useEffect(() => {
        if (simulationError) {
            toastError(`Simulation failed: ${simulationError.message}`)
        }
    }, [simulationError])
    if (!selectedPosition) return null
    const isLoading = isSimulating || isPreparing || isExecuting || isConfirming
    const handleRemove = () => {
        try {
            remove()
        } catch (err) {
            toastError(err instanceof Error ? err.message : 'Failed to remove liquidity')
        }
    }
    const getButtonText = () => {
        if (isPreparing) return 'Preparing...'
        if (isExecuting) return 'Confirm in wallet...'
        if (isConfirming) return 'Removing liquidity...'
        return 'Remove Liquidity'
    }
    return (
        <Dialog open={isRemoveLiquidityOpen} onOpenChange={closeRemoveLiquidity}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Remove Liquidity</DialogTitle>
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
                    <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">Amount to remove</div>
                        <div className="grid grid-cols-4 gap-2">
                            {PERCENTAGE_OPTIONS.map((p) => (
                                <Button
                                    key={p}
                                    type="button"
                                    variant={percentage === p ? 'default' : 'outline'}
                                    onClick={() => setPercentage(p)}
                                >
                                    {p}%
                                </Button>
                            ))}
                        </div>
                    </div>
                    <div className="bg-muted rounded-lg p-4 space-y-2">
                        <div className="text-sm text-muted-foreground">
                            You will receive at least:
                        </div>
                        <div className="flex justify-between">
                            <span>{selectedPosition.token0Info.symbol}</span>
                            <span className="font-medium">
                                {formatTokenAmount(
                                    amount0Min,
                                    selectedPosition.token0Info.decimals
                                )}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>{selectedPosition.token1Info.symbol}</span>
                            <span className="font-medium">
                                {formatTokenAmount(
                                    amount1Min,
                                    selectedPosition.token1Info.decimals
                                )}
                            </span>
                        </div>
                        {(selectedPosition.tokensOwed0 > 0n ||
                            selectedPosition.tokensOwed1 > 0n) && (
                            <>
                                <div className="border-t pt-2 mt-2">
                                    <div className="text-sm text-muted-foreground">
                                        Plus uncollected fees:
                                    </div>
                                </div>
                                {selectedPosition.tokensOwed0 > 0n && (
                                    <div className="flex justify-between text-green-600">
                                        <span>{selectedPosition.token0Info.symbol}</span>
                                        <span>
                                            +
                                            {formatTokenAmount(
                                                selectedPosition.tokensOwed0,
                                                selectedPosition.token0Info.decimals
                                            )}
                                        </span>
                                    </div>
                                )}
                                {selectedPosition.tokensOwed1 > 0n && (
                                    <div className="flex justify-between text-green-600">
                                        <span>{selectedPosition.token1Info.symbol}</span>
                                        <span>
                                            +
                                            {formatTokenAmount(
                                                selectedPosition.tokensOwed1,
                                                selectedPosition.token1Info.decimals
                                            )}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        size="lg"
                        onClick={handleRemove}
                        disabled={isLoading || liquidityToRemove === 0n}
                    >
                        {getButtonText()}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
