'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Plus } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { TICK_SPACING } from '@/types/earn'
import { useUserPositions } from '@/hooks/useUserPositions'
import { useDepositInfo } from '@/hooks/useStakedPositions'
import { useStakePosition } from '@/hooks/useStaking'
import { formatTokenAmount } from '@/services/tokens'
import { formatTimeRemaining } from '@/services/mining/incentives'
import { toastSuccess, toastError } from '@/lib/toast'
import { addStakedTokenId } from '@/lib/staked-positions-storage'
import type { PositionWithTokens, Incentive, V3PoolData } from '@/types/earn'

interface StakeDialogProps {
    open: boolean
    incentive: Incentive | null
    onClose: () => void
    onAddLiquidity: (pool: V3PoolData) => void
    onSuccess?: () => void
}

export function StakeDialog({
    open,
    incentive: selectedIncentive,
    onClose,
    onAddLiquidity,
    onSuccess,
}: StakeDialogProps) {
    const { address } = useAccount()
    const chainId = useChainId()
    const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
    const [approvalCompleted, setApprovalCompleted] = useState(false)
    type TxType = 'approval' | 'stake' | null
    const [pendingTxType, setPendingTxType] = useState<TxType>(null)
    const [processedTxHash, setProcessedTxHash] = useState<`0x${string}` | null>(null)
    const { positions, isLoading: isLoadingPositions } = useUserPositions(address, chainId)
    const eligiblePositions = useMemo(() => {
        if (!selectedIncentive) return []
        return positions.filter(
            (p) => p.poolAddress.toLowerCase() === selectedIncentive.pool.toLowerCase()
        )
    }, [positions, selectedIncentive])
    const selectedPosition = useMemo(() => {
        if (!selectedPositionId) return null
        return eligiblePositions.find((p) => p.tokenId.toString() === selectedPositionId) ?? null
    }, [eligiblePositions, selectedPositionId])
    const { isDeposited } = useDepositInfo(selectedPosition?.tokenId)
    const {
        stake,
        approveAndStake,
        needsApproval,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        error,
        hash,
    } = useStakePosition(selectedPosition, selectedIncentive, address)
    useEffect(() => {
        if (open) {
            setSelectedPositionId(null)
            setApprovalCompleted(false)
            setPendingTxType(null)
            setProcessedTxHash(null)
        }
    }, [open])
    useEffect(() => {
        if (isSuccess && hash && pendingTxType && hash !== processedTxHash) {
            if (pendingTxType === 'stake') {
                if (address && selectedPosition) {
                    addStakedTokenId(chainId, address, selectedPosition.tokenId)
                }
                toastSuccess('Position staked successfully!')
                setProcessedTxHash(hash)
                onSuccess?.()
                onClose()
            } else if (pendingTxType === 'approval') {
                toastSuccess('Approval successful! Please click again to stake.')
                setApprovalCompleted(true)
                setProcessedTxHash(hash)
            }
            setPendingTxType(null)
        }
    }, [
        isSuccess,
        hash,
        pendingTxType,
        processedTxHash,
        onClose,
        onSuccess,
        address,
        chainId,
        selectedPosition,
    ])
    useEffect(() => {
        if (error) {
            toastError(error)
        }
    }, [error])
    if (!selectedIncentive) return null
    const isLoading = isPreparing || isExecuting || isConfirming
    const canStake = selectedPosition && !isLoading && !isDeposited
    const getButtonText = () => {
        if (!selectedPosition) return 'Select a position'
        if (isDeposited) return 'Position already staked'
        if (isPreparing) return 'Preparing...'
        if (isExecuting) return 'Confirm in wallet...'
        if (isConfirming) return pendingTxType === 'stake' ? 'Staking...' : 'Approving...'
        if (needsApproval && !approvalCompleted) return 'Approve Position'
        return 'Stake Position'
    }
    const handleStake = () => {
        if (needsApproval && !approvalCompleted) {
            setPendingTxType('approval')
            approveAndStake()
        } else {
            setPendingTxType('stake')
            stake()
        }
    }
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Stake LP Position</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                    <div className="bg-muted rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">
                                {selectedIncentive.poolToken0.symbol} /{' '}
                                {selectedIncentive.poolToken1.symbol}
                            </span>
                            <Badge
                                variant="outline"
                                className="bg-positive/10 text-positive border-positive/20"
                            >
                                {selectedIncentive.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Reward: {selectedIncentive.rewardTokenInfo.symbol} &middot;{' '}
                            {formatTimeRemaining(selectedIncentive.endTime)}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <Label>Select Position to Stake</Label>
                        {isLoadingPositions ? (
                            <EmptyState title="Loading positions..." />
                        ) : eligiblePositions.length === 0 ? (
                            <EmptyState
                                title="No eligible positions"
                                description="Create an LP position for this pool first."
                                action={
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            onClose()
                                            onAddLiquidity({
                                                address: selectedIncentive.pool,
                                                token0: selectedIncentive.poolToken0,
                                                token1: selectedIncentive.poolToken1,
                                                fee: selectedIncentive.poolFee,
                                                liquidity: 0n,
                                                sqrtPriceX96: 0n,
                                                tick: 0,
                                                tickSpacing:
                                                    TICK_SPACING[selectedIncentive.poolFee] ?? 60,
                                            })
                                        }}
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        Add Liquidity
                                    </Button>
                                }
                                className="border rounded-lg p-4"
                            />
                        ) : (
                            <RadioGroup
                                value={selectedPositionId ?? ''}
                                onValueChange={setSelectedPositionId}
                            >
                                <div className="space-y-2">
                                    {eligiblePositions.map((position) => (
                                        <PositionOption
                                            key={position.tokenId.toString()}
                                            position={position}
                                            isSelected={
                                                selectedPositionId === position.tokenId.toString()
                                            }
                                        />
                                    ))}
                                </div>
                            </RadioGroup>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button size="lg" onClick={handleStake} disabled={!canStake}>
                        {getButtonText()}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

interface PositionOptionProps {
    position: PositionWithTokens
    isSelected: boolean
}

function PositionOption({ position, isSelected }: PositionOptionProps) {
    return (
        <label
            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
            }`}
        >
            <RadioGroupItem value={position.tokenId.toString()} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium">Position #{position.tokenId.toString()}</span>
                    {position.inRange ? (
                        <Badge
                            variant="outline"
                            className="bg-positive/10 text-positive border-positive/20"
                        >
                            In Range
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                            Out of Range
                        </Badge>
                    )}
                </div>
                <div className="text-sm text-muted-foreground">
                    {formatTokenAmount(position.amount0, position.token0Info.decimals)}{' '}
                    {position.token0Info.symbol} +{' '}
                    {formatTokenAmount(position.amount1, position.token1Info.decimals)}{' '}
                    {position.token1Info.symbol}
                </div>
            </div>
        </label>
    )
}
