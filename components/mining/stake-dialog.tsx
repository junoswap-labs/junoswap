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
import { useUserPositions } from '@/hooks/useUserPositions'
import { useStakerDeposits } from '@/hooks/useStakerDeposits'
import { useFarmStakes } from '@/hooks/useFarmStakes'
import { useStakePosition } from '@/hooks/useStaking'
import { formatBalance } from '@/lib/tokens'
import { formatTimeRemaining, incentiveToPoolData } from '@/services/mining/incentives'
import { toastSuccess, toastError } from '@/lib/toast'
import { markStaked } from '@/lib/optimistic-deposits'
import { getStakerAddress } from '@/lib/earn-programs'
import { txPhase } from '@/lib/tx-flow'
import { TxFlowDialog, type TxStep } from '@/components/ui/tx-flow-dialog'
import { TxStageFlow } from '@/components/ui/tx-stage'
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
    const [stakeCompleted, setStakeCompleted] = useState(false)
    const [txOpen, setTxOpen] = useState(false)
    // Frozen when the flow opens: getApproved flips the moment the approval lands, and
    // rebuilding the steps from it would delete the step being watched.
    const [flowNeedsApproval, setFlowNeedsApproval] = useState(false)
    const { positions, isLoading: isLoadingPositions } = useUserPositions(address, chainId)
    const program = selectedIncentive?.program ?? 'v3'
    const { deposits } = useStakerDeposits()
    // Wallet positions come from the indexer, which can still list an NFT after it moved into a
    // staker. The on-chain deposits decide: ones in either staker leave the wallet list, and the
    // viewer's own deposits in this farm's staker come back as stakeable in place.
    const myDeposits = useMemo(
        () =>
            deposits.filter(
                (d) => d.program === program && d.depositor.toLowerCase() === address?.toLowerCase()
            ),
        [deposits, program, address]
    )
    const eligiblePositions = useMemo(() => {
        if (!selectedIncentive) return []
        const inPool = (p: PositionWithTokens) =>
            p.poolAddress.toLowerCase() === selectedIncentive.pool.toLowerCase()
        const depositedIds = new Set(deposits.map((d) => d.position.tokenId.toString()))
        return [
            ...positions.filter((p) => inPool(p) && !depositedIds.has(p.tokenId.toString())),
            ...myDeposits.map((d) => d.position).filter(inPool),
        ]
    }, [positions, deposits, myDeposits, selectedIncentive])
    const selectedPosition = useMemo(() => {
        if (!selectedPositionId) return null
        return eligiblePositions.find((p) => p.tokenId.toString() === selectedPositionId) ?? null
    }, [eligiblePositions, selectedPositionId])
    const isDeposited =
        !!selectedPosition &&
        myDeposits.some((d) => d.position.tokenId === selectedPosition.tokenId)
    const { stakes: farmStakes } = useFarmStakes(
        selectedIncentive ? [selectedIncentive] : [],
        myDeposits
    )
    const alreadyStakedHere =
        !!selectedPosition &&
        farmStakes.some((s) => s.position.tokenId === selectedPosition.tokenId)
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
    } = useStakePosition(selectedPosition, selectedIncentive, address, program, isDeposited)
    useEffect(() => {
        if (open) {
            setSelectedPositionId(null)
            setApprovalCompleted(false)
            setPendingTxType(null)
            setProcessedTxHash(null)
            setStakeCompleted(false)
        }
    }, [open])
    useEffect(() => {
        if (isSuccess && hash && pendingTxType && hash !== processedTxHash) {
            if (pendingTxType === 'stake') {
                if (address && selectedPosition) {
                    markStaked(chainId, address, selectedPosition.tokenId)
                }
                toastSuccess('Position staked successfully!')
                setProcessedTxHash(hash)
                setStakeCompleted(true)
                // The tx dialog owns the success frame and closes both from its Done button.
                onSuccess?.()
            } else if (pendingTxType === 'approval') {
                toastSuccess('Approval successful!')
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
    const canStake = selectedPosition && !isLoading && !alreadyStakedHere
    const getButtonText = () => {
        if (!selectedPosition) return 'Select a position'
        if (alreadyStakedHere) return 'Position already staked'
        if (isPreparing) return 'Preparing...'
        if (isExecuting) return 'Confirm in wallet...'
        if (isConfirming) return pendingTxType === 'stake' ? 'Staking...' : 'Approving...'
        if (needsApproval && !approvalCompleted) return 'Approve Position'
        return 'Stake Position'
    }
    const runApprove = () => {
        setPendingTxType('approval')
        approveAndStake()
    }
    const runStake = () => {
        setPendingTxType('stake')
        stake()
    }
    const handleStake = () => {
        const needs = needsApproval && !approvalCompleted
        setFlowNeedsApproval(needs)
        setTxOpen(true)
        if (needs) runApprove()
        else runStake()
    }

    /**
     * useStakePosition writes approval and stake through one wagmi hook, so its flags
     * describe whichever call is in flight. pendingTxType says which step owns them, and
     * the completed flags carry a landed step past the point where the flags move on.
     */
    const stakerAddress = getStakerAddress(chainId, selectedIncentive.program ?? 'v3')
    const sharedFlags = {
        isPending: isPreparing || isExecuting,
        isConfirming,
        isError: !!error,
        error,
        hash,
    }
    const positionSide = selectedPosition
        ? {
              kind: 'position' as const,
              tokenId: selectedPosition.tokenId,
              feeTier: selectedPosition.fee,
              inRange: selectedPosition.inRange,
              token0: selectedPosition.token0Info,
              token1: selectedPosition.token1Info,
          }
        : null
    const txSteps: TxStep[] = []
    if (positionSide && selectedPosition) {
        const stakerSide = (amount: string) => ({
            kind: 'contract' as const,
            label: 'Farm staker',
            address: stakerAddress,
            amount,
        })
        if (flowNeedsApproval) {
            txSteps.push({
                label: `Approve position #${selectedPosition.tokenId.toString()}`,
                phase: approvalCompleted
                    ? 'success'
                    : pendingTxType === 'approval'
                      ? txPhase(sharedFlags)
                      : 'idle',
                hash: pendingTxType === 'approval' ? hash : undefined,
                error,
                run: runApprove,
                renderStage: (phase) => (
                    <TxStageFlow
                        phase={phase}
                        chainId={chainId}
                        from={positionSide}
                        to={stakerSide('Approved')}
                    />
                ),
            })
        }
        txSteps.push({
            label: `Stake position #${selectedPosition.tokenId.toString()}`,
            phase: stakeCompleted
                ? 'success'
                : pendingTxType === 'stake'
                  ? txPhase(sharedFlags)
                  : 'idle',
            hash: pendingTxType === 'stake' || stakeCompleted ? hash : undefined,
            error,
            run: runStake,
            renderStage: (phase) => (
                <TxStageFlow
                    phase={phase}
                    chainId={chainId}
                    from={positionSide}
                    to={stakerSide('Staked')}
                />
            ),
        })
    }
    return (
        <>
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
                                                onAddLiquidity(
                                                    incentiveToPoolData(selectedIncentive)
                                                )
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
                                                    selectedPositionId ===
                                                    position.tokenId.toString()
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

            {/* Its own Radix root, outside this one, so the two modals don't fight over focus. */}
            <TxFlowDialog
                open={txOpen}
                onOpenChange={setTxOpen}
                title="Stake LP position"
                steps={txSteps}
                chainId={chainId}
                onDone={onClose}
            />
        </>
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
                    {formatBalance(position.amount0, position.token0Info.decimals)}{' '}
                    {position.token0Info.symbol} +{' '}
                    {formatBalance(position.amount1, position.token1Info.decimals)}{' '}
                    {position.token1Info.symbol}
                </div>
            </div>
        </label>
    )
}
