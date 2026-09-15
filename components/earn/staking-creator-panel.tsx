'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useChainId, useReadContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { formatUnits, zeroAddress } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useStakingPoolActions, useStartEpoch } from '@/hooks/useStakingActions'
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
import { useNowSeconds } from '@/hooks/useNowSeconds'
import { getStakingStatus } from '@/services/staking/metrics'
import { formatBalance, parseTokenAmount } from '@/lib/tokens'
import { formatDateTime, formatDuration } from '@/lib/duration'
import { formatExactAmount, formatRateAmount } from '@/lib/format'
import { toastError, toastSuccess } from '@/lib/toast'
import type { StakingPool } from '@/types/staking'

const SECONDS_PER_DAY = 86_400
const MAX_DURATION_DAYS = 365

/**
 * What the pool's creator can do that a staker cannot: fund the next epoch on the same pool,
 * retire it, and pull back the budget that ran while nothing was staked. All three are only
 * legal between epochs, so the panel follows the schedule rather than offering dead buttons.
 */
export function StakingCreatorPanel({
    pool,
    onSettled,
}: {
    pool: StakingPool
    onSettled: () => void
}) {
    const chainId = useChainId()
    const now = useNowSeconds()
    const { address: account } = useAccount()
    const queryClient = useQueryClient()

    const [rewardAmount, setRewardAmount] = useState('')
    const [durationValue, setDurationValue] = useState('30')
    const [durationUnit, setDurationUnit] = useState<ScheduleUnit>('days')
    const [lockValue, setLockValue] = useState('0')
    const [lockUnit, setLockUnit] = useState<ScheduleUnit>('days')
    const [startMode, setStartMode] = useState<StartMode>('now')
    const [startAt, setStartAt] = useState('')
    const [capValue, setCapValue] = useState('')
    const lastAction = useRef<'approve' | 'epoch' | null>(null)

    const epoch = useStartEpoch()
    const actions = useStakingPoolActions(pool.address, pool.view.stakingToken)

    const status = getStakingStatus(pool.view, now)
    const isBetweenEpochs = status === 'ended'
    const isClosed = pool.view.closed

    const { data: allowance } = useReadContract({
        address: pool.view.rewardsToken,
        abi: getAbi('erc20'),
        functionName: 'allowance',
        args: [account ?? zeroAddress, epoch.factory ?? zeroAddress],
        chainId,
        query: { enabled: !!account && !!epoch.factory },
    })

    const rewardWei = parseTokenAmount(rewardAmount || '0', pool.rewardTokenInfo.decimals)
    const duration = Number(durationValue || '0') * unitSeconds(durationUnit)
    const lock = Number(lockValue || '0') * unitSeconds(lockUnit)
    const needsApproval = rewardWei > 0n && ((allowance as bigint | undefined) ?? 0n) < rewardWei
    const startTime = startTimeSeconds(startMode, startAt)
    const cap = capValue ? parseTokenAmount(capValue, pool.stakingTokenInfo.decimals) : 0n
    const perDay =
        duration > 0
            ? Number(formatUnits(rewardWei, pool.rewardTokenInfo.decimals)) /
              (duration / SECONDS_PER_DAY)
            : 0
    const isBusy = epoch.isPending || epoch.isConfirming

    const submitEpoch = () => {
        lastAction.current = 'epoch'
        epoch.startEpoch(pool.address, {
            rewardAmount: rewardWei,
            startTime,
            rewardsDuration: BigInt(duration),
            lockDuration: BigInt(lock),
            maxStakingPower: cap,
        })
    }

    useOnTxSuccess(true, epoch.isSuccess, epoch.hash, () => {
        if (lastAction.current === 'approve') {
            submitEpoch()
            return
        }
        toastSuccess('Next epoch funded')
        queryClient.invalidateQueries()
        setRewardAmount('')
        setStartMode('now')
        setStartAt('')
        setCapValue('')
        onSettled()
    })

    useOnTxSuccess(true, actions.isSuccess, actions.hash, () => {
        toastSuccess('Pool updated')
        queryClient.invalidateQueries()
        onSettled()
    })

    useEffect(() => {
        if (epoch.error) toastError(epoch.error)
    }, [epoch.error])
    useEffect(() => {
        if (actions.error) toastError(actions.error)
    }, [actions.error])

    const epochBlocker = (() => {
        if (isClosed) return 'Pool is retired'
        if (!isBetweenEpochs) return 'Current epoch is still running'
        if (rewardWei <= 0n) return 'Enter the reward amount'
        if (duration <= 0) return 'Enter the duration'
        if (duration > MAX_DURATION_DAYS * SECONDS_PER_DAY) return 'At most 365 days'
        if (lock > duration) return 'Lock cannot outlast the epoch'
        if (startMode === 'scheduled' && startTime === 0n) return 'Pick the start time'
        if (startTime > BigInt(Math.floor(Date.now() / 1000) + MAX_DURATION_DAYS * SECONDS_PER_DAY))
            return 'Start within 365 days'
        return null
    })()

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-border/50 bg-muted/20 p-3 text-xs">
                <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">Running epoch</span>
                    <span className="font-medium">
                        {pool.epoch} · {isClosed ? 'retired' : status}
                    </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="font-medium tabular-nums">
                        {formatBalance(pool.view.rewardForDuration, pool.rewardTokenInfo.decimals)}{' '}
                        {pool.rewardTokenInfo.symbol}
                    </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-muted-foreground">Unearned so far</span>
                    <span className="font-medium tabular-nums">
                        {formatBalance(pool.view.unallocatedRewards, pool.rewardTokenInfo.decimals)}{' '}
                        {pool.rewardTokenInfo.symbol}
                    </span>
                </div>
            </div>

            {!isClosed && (
                <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Fund the next epoch</h4>
                    <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/10 p-3">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                Reward ({pool.rewardTokenInfo.symbol})
                            </Label>
                            <Input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                placeholder="0.0"
                                value={rewardAmount}
                                onChange={(e) => setRewardAmount(e.target.value)}
                                disabled={!isBetweenEpochs}
                                className={FIELD_CLASS}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <DurationField
                                label="Duration"
                                value={durationValue}
                                unit={durationUnit}
                                onValueChange={setDurationValue}
                                onUnitChange={setDurationUnit}
                                disabled={!isBetweenEpochs}
                                min="1"
                            />
                            <DurationField
                                label="Lock"
                                value={lockValue}
                                unit={lockUnit}
                                onValueChange={setLockValue}
                                onUnitChange={setLockUnit}
                                disabled={!isBetweenEpochs}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <StartField
                                mode={startMode}
                                value={startAt}
                                onModeChange={setStartMode}
                                onValueChange={setStartAt}
                                disabled={!isBetweenEpochs}
                            />
                            <FieldShell label={`Max staked (${pool.stakingTokenInfo.symbol})`}>
                                <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    inputMode="decimal"
                                    placeholder="Unlimited"
                                    value={capValue}
                                    onChange={(e) => setCapValue(e.target.value)}
                                    disabled={!isBetweenEpochs}
                                    className={FIELD_CLASS}
                                />
                            </FieldShell>
                        </div>
                    </div>

                    <div className="space-y-1.5 rounded-2xl bg-muted/20 px-3 py-2 text-xs">
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="text-muted-foreground">New epoch</span>
                            <span className="font-medium">{pool.epoch + 1}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="text-muted-foreground">Runs for</span>
                            <span className="font-medium">
                                {duration > 0 ? formatDuration(duration) : '—'}
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="text-muted-foreground">Stakes locked</span>
                            <span className="font-medium">
                                {lock > 0 ? formatDuration(lock) : 'no lock'}
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="text-muted-foreground">Starts</span>
                            <span className="font-medium">
                                {startTime > 0n ? formatDateTime(Number(startTime)) : 'immediately'}
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="text-muted-foreground">Max staked</span>
                            <span className="font-medium tabular-nums">
                                {cap > 0n
                                    ? `${formatExactAmount(cap, pool.stakingTokenInfo.decimals)} ${pool.stakingTokenInfo.symbol}`
                                    : 'unlimited'}
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-4">
                            <span className="text-muted-foreground">Daily reward</span>
                            <span className="font-medium tabular-nums">
                                {perDay > 0
                                    ? `${formatRateAmount(perDay, pool.rewardTokenInfo.symbol)} / day`
                                    : '—'}
                            </span>
                        </div>
                        <p className="pt-1 text-[11px] text-muted-foreground">
                            Existing stakes stay in place; nobody has to unstake between epochs.
                        </p>
                    </div>

                    <Button
                        className="w-full"
                        size="lg"
                        disabled={isBusy || epochBlocker !== null}
                        isLoading={isBusy}
                        onClick={() => {
                            if (epochBlocker) return
                            if (needsApproval) {
                                lastAction.current = 'approve'
                                epoch.approveReward(pool.view.rewardsToken)
                                return
                            }
                            submitEpoch()
                        }}
                    >
                        {isBusy
                            ? lastAction.current === 'approve'
                                ? 'Approving...'
                                : 'Funding epoch...'
                            : (epochBlocker ?? 'Fund next epoch')}
                    </Button>
                </div>
            )}

            {isClosed && pool.view.unallocatedRewards > 0n && (
                <Button
                    className="w-full"
                    size="lg"
                    disabled={actions.isPending || actions.isConfirming}
                    isLoading={actions.isPending || actions.isConfirming}
                    onClick={() => actions.recoverUnallocated()}
                >
                    Recover{' '}
                    {formatBalance(pool.view.unallocatedRewards, pool.rewardTokenInfo.decimals)}{' '}
                    {pool.rewardTokenInfo.symbol}
                </Button>
            )}

            {!isClosed && (
                <div className="space-y-2 rounded-2xl border border-destructive/25 bg-destructive/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold">Retire this pool</h4>
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10"
                            disabled={!isBetweenEpochs || actions.isPending || actions.isConfirming}
                            onClick={() => actions.close()}
                        >
                            Retire
                        </Button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Permanent: no further epochs, and it unlocks recovery of the budget that ran
                        while nothing was staked. It can never cut an epoch short, and withdrawing
                        and claiming stay open forever.
                    </p>
                </div>
            )}
        </div>
    )
}
