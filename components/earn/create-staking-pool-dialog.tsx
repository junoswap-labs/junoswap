'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useChainId, useReadContracts } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { zeroAddress, type Address } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { TokenSelect } from '@/components/swap/token-select'
import { ConnectModal } from '@/components/web3/connect-modal'
import { useCreateStakingPool } from '@/hooks/useStakingActions'
import { useOnTxSuccess } from '@/hooks/useOnTxSuccess'
import {
    DurationField,
    FIELD_CLASS,
    FieldShell,
    StartField,
    startTimeSeconds,
    unitSeconds,
    type ScheduleUnit,
    type StartMode,
} from '@/components/earn/duration-field'
import { formatBalance, formatTokenAmount, parseTokenAmount } from '@/lib/tokens'
import { useChainTokens } from '@/hooks/useChainTokens'
import { isNativeToken } from '@/lib/wagmi'
import { formatDateTime, formatDuration } from '@/lib/duration'
import { formatExactAmount } from '@/lib/format'
import { toastError, toastSuccess } from '@/lib/toast'
import type { Token } from '@/types/token'

const SECONDS_PER_DAY = 86_400
/** StakingRewards caps an epoch at a year. */
const MAX_DURATION_DAYS = 365

export function CreateStakingPoolDialog({
    open,
    onClose,
    onSuccess,
}: {
    open: boolean
    onClose: () => void
    onSuccess?: () => void
}) {
    const chainId = useChainId()
    const { address: account, isConnected } = useAccount()
    const queryClient = useQueryClient()
    const create = useCreateStakingPool()

    const [stakingToken, setStakingToken] = useState<Token | null>(null)
    const [rewardsToken, setRewardsToken] = useState<Token | null>(null)
    const [rewardAmount, setRewardAmount] = useState('')
    const [durationValue, setDurationValue] = useState('30')
    const [durationUnit, setDurationUnit] = useState<ScheduleUnit>('days')
    const [lockValue, setLockValue] = useState('0')
    const [lockUnit, setLockUnit] = useState<ScheduleUnit>('days')
    const [startMode, setStartMode] = useState<StartMode>('now')
    const [startAt, setStartAt] = useState('')
    const [capValue, setCapValue] = useState('')
    const [isConnectOpen, setIsConnectOpen] = useState(false)
    // What the shared write hook is currently carrying — the allowance read lags a confirmed
    // approval by a block or two, so it cannot be used to tell the two transactions apart.
    const lastAction = useRef<'approve-fee' | 'approve' | 'create' | null>(null)

    useEffect(() => {
        if (!open) return
        setStakingToken(null)
        setRewardsToken(null)
        setRewardAmount('')
        setDurationValue('30')
        setDurationUnit('days')
        setStartMode('now')
        setStartAt('')
        setCapValue('')
        setLockValue('0')
        setLockUnit('days')
        lastAction.current = null
    }, [open])

    // Same list the swap picker offers — static, graduated, v3 and imported tokens. The pool moves
    // both tokens with transferFrom, so the native coin can never be used.
    const { tokens: chainTokens } = useChainTokens(chainId)
    const tokenOptions = useMemo(
        () => chainTokens.filter((t) => !isNativeToken(t.address as Address)),
        [chainTokens]
    )

    const { data: balances } = useReadContracts({
        contracts: [
            {
                address: rewardsToken?.address as Address,
                abi: getAbi('erc20'),
                functionName: 'balanceOf' as const,
                args: [account ?? zeroAddress] as const,
                chainId,
            },
            {
                address: rewardsToken?.address as Address,
                abi: getAbi('erc20'),
                functionName: 'allowance' as const,
                args: [account ?? zeroAddress, create.factory ?? zeroAddress] as const,
                chainId,
            },
            {
                address: stakingToken?.address as Address,
                abi: getAbi('erc20'),
                functionName: 'balanceOf' as const,
                args: [account ?? zeroAddress] as const,
                chainId,
            },
            {
                address: (create.fee?.token ?? zeroAddress) as Address,
                abi: getAbi('erc20'),
                functionName: 'allowance' as const,
                args: [account ?? zeroAddress, create.factory ?? zeroAddress] as const,
                chainId,
            },
        ],
        query: { enabled: !!rewardsToken && !!account && !!create.factory },
    })

    const rewardBalance = (balances?.[0]?.result as bigint | undefined) ?? 0n
    const rewardAllowance = (balances?.[1]?.result as bigint | undefined) ?? 0n
    const stakingBalance = (balances?.[2]?.result as bigint | undefined) ?? 0n
    const feeAllowance = (balances?.[3]?.result as bigint | undefined) ?? 0n

    const rewardWei = rewardsToken
        ? parseTokenAmount(rewardAmount || '0', rewardsToken.decimals)
        : 0n
    const duration = Number(durationValue || '0') * unitSeconds(durationUnit)
    const lock = Number(lockValue || '0') * unitSeconds(lockUnit)
    const needsApproval = !!rewardsToken && rewardWei > 0n && rewardAllowance < rewardWei
    const needsFeeApproval = !!create.fee && feeAllowance < create.fee.amount
    const isBusy = create.isPending || create.isConfirming

    const startTime = startTimeSeconds(startMode, startAt)
    const cap = capValue && stakingToken ? parseTokenAmount(capValue, stakingToken.decimals) : 0n

    const blocker = (() => {
        if (!stakingToken) return 'Select the staking token'
        if (!rewardsToken) return 'Select the reward token'
        if (rewardWei <= 0n) return 'Enter the reward amount'
        if (rewardWei > rewardBalance) return 'Reward exceeds your balance'
        if (duration <= 0) return 'Enter the duration'
        if (duration > MAX_DURATION_DAYS * SECONDS_PER_DAY) return 'At most 365 days'
        if (lock > duration) return 'Lock cannot outlast the epoch'
        if (startMode === 'scheduled' && startTime === 0n) return 'Pick the start time'
        if (startTime > BigInt(Math.floor(Date.now() / 1000) + MAX_DURATION_DAYS * SECONDS_PER_DAY))
            return 'Start within 365 days'
        return null
    })()

    const submitCreate = useCallback(() => {
        if (!stakingToken || !rewardsToken) return
        lastAction.current = 'create'
        create.create({
            stakingToken: stakingToken.address as Address,
            rewardsToken: rewardsToken.address as Address,
            rewardAmount: rewardWei,
            startTime,
            rewardsDuration: BigInt(duration),
            lockDuration: BigInt(lock),
            maxStakingPower: cap,
        })
    }, [create, stakingToken, rewardsToken, rewardWei, duration, lock, startTime, cap])

    const submitNext = useCallback(() => {
        if (needsFeeApproval && create.fee) {
            lastAction.current = 'approve-fee'
            create.approveReward(create.fee.token)
            return
        }
        if (needsApproval && rewardsToken) {
            lastAction.current = 'approve'
            create.approveReward(rewardsToken.address as Address)
            return
        }
        submitCreate()
    }, [create, needsApproval, needsFeeApproval, rewardsToken, submitCreate])

    // One click: approve whatever the factory still has to pull, then create.
    useOnTxSuccess(open, create.isSuccess, create.hash, () => {
        if (lastAction.current === 'approve-fee') {
            if (needsApproval && rewardsToken) {
                lastAction.current = 'approve'
                create.approveReward(rewardsToken.address as Address)
            } else {
                submitCreate()
            }
            return
        }
        if (lastAction.current === 'approve') {
            submitCreate()
            return
        }
        toastSuccess('Staking pool created!')
        queryClient.invalidateQueries()
        onSuccess?.()
        onClose()
    })

    useEffect(() => {
        if (create.error) toastError(create.error)
    }, [create.error])

    const label = () => {
        if (!isConnected) return 'Connect Wallet'
        if (blocker) return blocker
        if (isBusy) {
            if (lastAction.current === 'approve-fee') return 'Approving fee...'
            if (lastAction.current === 'approve')
                return `Approving ${rewardsToken?.symbol ?? 'reward token'}...`
            return 'Creating pool...'
        }
        return 'Create pool'
    }

    return (
        <>
            <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="sm:max-w-lg max-h-[90vh] bg-card/95 backdrop-blur-md border-border/50">
                    <DialogHeader>
                        <DialogTitle className="text-lg">Create Token Staking Pool</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-9rem)] pr-1">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                Token to stake
                            </Label>
                            <TokenSelect
                                token={stakingToken}
                                tokens={tokenOptions}
                                onSelect={setStakingToken}
                                className="w-full justify-between"
                            />
                            {stakingToken && (
                                <p className="text-[11px] text-muted-foreground">
                                    Your balance:{' '}
                                    {formatBalance(stakingBalance, stakingToken.decimals)}{' '}
                                    {stakingToken.symbol}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                Total reward
                            </Label>
                            <div className="rounded-2xl bg-muted/20 border border-border/30 p-3 space-y-2">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        inputMode="decimal"
                                        placeholder="0.0"
                                        value={rewardAmount}
                                        onChange={(e) => setRewardAmount(e.target.value)}
                                        className="min-w-0 flex-1 bg-transparent text-xl font-semibold placeholder:text-muted-foreground/40 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                    <TokenSelect
                                        token={rewardsToken}
                                        tokens={tokenOptions}
                                        onSelect={setRewardsToken}
                                        className="h-10 shrink-0 rounded-xl bg-muted/40 border-border/40 hover:bg-muted/60"
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] text-muted-foreground">
                                        Balance:{' '}
                                        {rewardsToken
                                            ? formatBalance(rewardBalance, rewardsToken.decimals)
                                            : '0'}
                                    </p>
                                    {rewardsToken && rewardBalance > 0n && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setRewardAmount(
                                                    formatTokenAmount(
                                                        rewardBalance,
                                                        rewardsToken.decimals
                                                    )
                                                )
                                            }
                                            className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold transition-colors hover:bg-foreground/15"
                                        >
                                            MAX
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <DurationField
                                label="Duration"
                                value={durationValue}
                                unit={durationUnit}
                                onValueChange={setDurationValue}
                                onUnitChange={setDurationUnit}
                                min="1"
                            />
                            <DurationField
                                label="Lock"
                                value={lockValue}
                                unit={lockUnit}
                                onValueChange={setLockValue}
                                onUnitChange={setLockUnit}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <StartField
                                mode={startMode}
                                value={startAt}
                                onModeChange={setStartMode}
                                onValueChange={setStartAt}
                            />
                            <FieldShell
                                label={`Max staked${stakingToken ? ` (${stakingToken.symbol})` : ''}`}
                            >
                                <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    inputMode="decimal"
                                    placeholder="Unlimited"
                                    value={capValue}
                                    onChange={(e) => setCapValue(e.target.value)}
                                    className={FIELD_CLASS}
                                />
                            </FieldShell>
                        </div>

                        <Separator />

                        <div className="space-y-2 text-sm">
                            <div className="flex items-baseline justify-between gap-4">
                                <span className="text-muted-foreground">Runs for</span>
                                <span className="font-medium">
                                    {duration > 0 ? formatDuration(duration) : '—'}
                                </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-4">
                                <span className="text-muted-foreground">Stakes locked for</span>
                                <span className="font-medium">
                                    {lock > 0 ? formatDuration(lock) : 'no lock'}
                                </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-4">
                                <span className="text-muted-foreground">Starts</span>
                                <span className="font-medium">
                                    {startTime > 0n
                                        ? formatDateTime(Number(startTime))
                                        : 'immediately'}
                                </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-4">
                                <span className="text-muted-foreground">Max staked</span>
                                <span className="font-medium tabular-nums">
                                    {cap > 0n && stakingToken
                                        ? `${formatExactAmount(cap, stakingToken.decimals)} ${stakingToken.symbol}`
                                        : 'unlimited'}
                                </span>
                            </div>
                            {create.fee && (
                                <div className="flex items-baseline justify-between gap-4">
                                    <span className="text-muted-foreground">Creation fee</span>
                                    <span className="font-medium tabular-nums">
                                        {formatBalance(create.fee.amount, 18)}
                                    </span>
                                </div>
                            )}
                        </div>

                        <p className="rounded-xl bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                            The reward is pulled from your wallet into the new pool when it is
                            created. When the epoch ends you can fund another one on the same pool —
                            stakers never have to unstake.
                        </p>

                        <Button
                            className="w-full"
                            size="lg"
                            disabled={isConnected && (isBusy || blocker !== null)}
                            isLoading={isBusy}
                            loadingText={label()}
                            onClick={() => {
                                if (!isConnected) {
                                    setIsConnectOpen(true)
                                    return
                                }
                                if (blocker || !stakingToken || !rewardsToken) return
                                submitNext()
                            }}
                        >
                            {label()}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
            <ConnectModal open={isConnectOpen} onOpenChange={setIsConnectOpen} />
        </>
    )
}
