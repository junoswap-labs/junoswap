'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAccount, useChainId } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import {
    ArrowLeft,
    Check,
    Copy,
    ExternalLink,
    Maximize2,
    Plus,
    Settings2,
    Share2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { PaginationControls } from '@/components/ui/pagination'
import { TokenIcon } from '@/components/ui/token-icon'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConnectModal } from '@/components/web3/connect-modal'
import { useStakingPools } from '@/hooks/useStakingPools'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { useStakingPoolActions, useClaimAllStaking } from '@/hooks/useStakingActions'
import { useStakingLots } from '@/hooks/useStakingLots'
import { StakingCreatorPanel } from '@/components/earn/staking-creator-panel'
import { useOnTxSuccess } from '@/hooks/useOnTxSuccess'
import { useNowSeconds } from '@/hooks/useNowSeconds'
import { useTokenPriceMap } from '@/hooks/useTokenPriceMap'
import { getStakingRewards } from '@/lib/earn-programs'
import { clampPage, getTotalPages, paginate } from '@/services/mining/farm-list'
import {
    filterStakingPools,
    getStakingApr,
    getStakingStatus,
    rewardPerSecond,
    sortStakingPools,
} from '@/services/staking/metrics'
import { formatDuration, formatRelativeTime } from '@/lib/duration'
import {
    formatAprPercent,
    formatExactAmount,
    formatRateAmount,
    formatRewardAmount,
} from '@/lib/format'
import { cn, formatAddress } from '@/lib/utils'
import { getChainMetadata } from '@/lib/wagmi'
import { formatBalance, formatTokenAmount, parseTokenAmount } from '@/lib/tokens'
import { toastError, toastSuccess } from '@/lib/toast'
import { txPhase } from '@/lib/tx-flow'
import { TxFlowDialog, actionStep, type TxStep } from '@/components/ui/tx-flow-dialog'
import { TxStageFlow, TxStageRecord } from '@/components/ui/tx-stage'
import type { StakingPool, StakingPoolFilter, StakingPoolStatus } from '@/types/staking'

const SECONDS_PER_DAY = 86_400
const LOTS_PER_PAGE = 4
const POOLS_PER_BATCH = 9

function min(a: bigint, b: bigint): bigint {
    return a < b ? a : b
}

const FILTERS: { value: StakingPoolFilter; label: string }[] = [
    { value: 'all', label: 'All pools' },
    { value: 'active', label: 'Active' },
    { value: 'my-stakes', label: 'My stakes' },
]

const STATUS_LABEL: Record<StakingPoolStatus, string> = {
    active: 'Active',
    pending: 'Upcoming',
    ended: 'Ended',
    closed: 'Closed',
}

function StatusBadge({ status }: { status: StakingPoolStatus }) {
    return (
        <Badge
            variant={status === 'active' ? 'default' : 'outline'}
            className="shrink-0 capitalize"
        >
            {STATUS_LABEL[status]}
        </Badge>
    )
}

function Metric({
    label,
    unit,
    value,
    sub,
    subHint,
    hint,
    accent,
}: {
    label: string
    unit?: string
    value: string
    sub?: string
    /** The exact figure behind an abbreviated `sub`, on hover. */
    subHint?: string
    hint?: string
    accent?: boolean
}) {
    return (
        <div className="min-w-0">
            <div
                className={cn(
                    'truncate text-[10px] uppercase tracking-wider text-muted-foreground',
                    hint && 'cursor-help underline decoration-dotted underline-offset-2'
                )}
                title={hint}
            >
                {label}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
                <span
                    className={cn(
                        'truncate text-base font-bold tracking-tight',
                        accent && 'text-positive'
                    )}
                >
                    {value}
                </span>
                {unit && (
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                        {unit}
                    </span>
                )}
            </div>
            {sub && (
                <div
                    className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                    title={subHint}
                >
                    {sub}
                </div>
            )}
        </div>
    )
}

/** One pool's claim call, with the toasts and the step list its dialog shows. */
function usePoolClaim(pool: StakingPool) {
    const chainId = useChainId()
    const claim = useStakingPoolActions(pool.address, pool.view.stakingToken)
    const [claimOpen, setClaimOpen] = useState(false)
    const queryClient = useQueryClient()
    useOnTxSuccess(true, claim.isSuccess, claim.hash, () => {
        toastSuccess('Rewards claimed')
        queryClient.invalidateQueries()
    })
    useEffect(() => {
        if (claim.error) toastError(claim.error)
    }, [claim.error])
    const claimSteps = [
        actionStep({
            label: 'Claim rewards',
            flags: {
                isPending: claim.isPending,
                isConfirming: claim.isConfirming,
                isSuccess: claim.isSuccess,
                isError: !!claim.error,
                error: claim.error,
                hash: claim.hash,
            },
            run: () => claim.claim(),
            renderStage: (phase) => (
                <TxStageFlow
                    phase={phase}
                    chainId={chainId}
                    hash={claim.hash}
                    from={{
                        kind: 'contract',
                        label: `${pool.stakingTokenInfo.symbol} pool`,
                        address: pool.address,
                        amount: 'Earned',
                    }}
                    to={{
                        kind: 'token',
                        token: pool.rewardTokenInfo,
                        amount: formatTokenAmount(pool.user.earned, pool.rewardTokenInfo.decimals),
                    }}
                />
            ),
        }),
    ]
    return { claim, claimOpen, setClaimOpen, claimSteps }
}

function PoolCard({
    pool,
    aprPercent,
    now,
    onManage,
    onCreatorControls,
    onConnect,
    fullPage,
}: {
    pool: StakingPool
    aprPercent: number | null
    now: number
    onManage: (pool: StakingPool) => void
    onCreatorControls: (pool: StakingPool) => void
    onConnect: () => void
    fullPage?: boolean
}) {
    const { address: account, isConnected } = useAccount()
    const chainId = useChainId()
    const isCreator = !!account && account.toLowerCase() === pool.view.creator.toLowerCase()
    const status = getStakingStatus(pool.view, now)
    // Every creator action is only legal between epochs, so the gear stays hidden until then.
    const canManagePool = status === 'ended' || status === 'closed'
    const { claim, claimOpen, setClaimOpen, claimSteps } = usePoolClaim(pool)
    const perDay = rewardPerSecond(pool.view, pool.rewardTokenInfo.decimals) * SECONDS_PER_DAY
    // A cap is a limit a staker can actually hit, so the card says how close it is.
    const capPercent =
        pool.view.maxStakingPower > 0n
            ? Number((pool.view.totalSupply * 10_000n) / pool.view.maxStakingPower) / 100
            : null
    // Share of the pool is what actually sets this account's cut of the daily reward.
    const sharePercent =
        pool.user.balance > 0n && pool.view.totalSupply > 0n
            ? Number((pool.user.balance * 10_000n) / pool.view.totalSupply) / 100
            : null
    const endsIn =
        status === 'active'
            ? `Ends ${formatRelativeTime(Number(pool.view.periodFinish), now)}`
            : status === 'pending'
              ? `Starts ${formatRelativeTime(Number(pool.view.startTime), now)}`
              : STATUS_LABEL[status]

    return (
        <Card className="position-card-hover flex flex-col overflow-hidden">
            <TxFlowDialog
                open={claimOpen}
                onOpenChange={setClaimOpen}
                title="Claim rewards"
                steps={claimSteps}
                chainId={chainId}
            />
            <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                        <TokenIcon
                            src={pool.stakingTokenInfo.logo}
                            symbol={pool.stakingTokenInfo.symbol}
                            size="md"
                        />
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="truncate font-semibold">
                                    Stake {pool.stakingTokenInfo.symbol}
                                </span>
                                {!fullPage && (
                                    <Link
                                        href={`/earn/staking/${pool.address}?chain=${chainId}`}
                                        title="Open pool full screen"
                                        aria-label="Open pool full screen"
                                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        <Maximize2 className="h-3.5 w-3.5" />
                                    </Link>
                                )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                                Earn {pool.rewardTokenInfo.symbol} ·{' '}
                                {pool.view.lockDuration > 0n
                                    ? `${formatDuration(Number(pool.view.lockDuration))} lock`
                                    : 'no lock'}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{endsIn}</div>
                            <div className="truncate text-xs text-muted-foreground">
                                Created by{' '}
                                <a
                                    href={`${getChainMetadata(chainId).explorer}/address/${pool.view.creator}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={pool.view.creator}
                                    className="font-mono hover:text-foreground"
                                >
                                    {formatAddress(pool.view.creator)}
                                </a>
                                {isCreator && ' (you)'}
                            </div>
                        </div>
                    </div>
                    <StatusBadge status={status} />
                </div>

                <Separator className="my-4" />

                <div className="flex flex-1 flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Metric
                            label="APR"
                            value={formatAprPercent(aprPercent)}
                            sub={pool.view.totalSupply === 0n ? 'no stakers yet' : undefined}
                        />
                        <Metric
                            label="Total staked"
                            unit={pool.stakingTokenInfo.symbol}
                            value={formatBalance(
                                pool.view.totalSupply,
                                pool.stakingTokenInfo.decimals
                            )}
                            sub={
                                capPercent === null
                                    ? undefined
                                    : `${capPercent.toFixed(capPercent >= 10 ? 0 : 1)}% of ${formatBalance(
                                          pool.view.maxStakingPower,
                                          pool.stakingTokenInfo.decimals
                                      )} cap`
                            }
                            subHint={
                                capPercent === null
                                    ? undefined
                                    : `${formatExactAmount(pool.view.totalSupply, pool.stakingTokenInfo.decimals)} of ${formatExactAmount(
                                          pool.view.maxStakingPower,
                                          pool.stakingTokenInfo.decimals
                                      )} ${pool.stakingTokenInfo.symbol} staked`
                            }
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Metric
                            label="Daily Reward"
                            unit={pool.rewardTokenInfo.symbol}
                            value={perDay > 0 ? formatRateAmount(perDay) : '—'}
                            hint="The epoch's whole budget spread evenly over its duration, then split between everyone staked at that moment — so your share moves with the total staked, not with the clock."
                        />
                        <Metric
                            label="Your staked power"
                            unit={pool.stakingTokenInfo.symbol}
                            value={formatBalance(pool.user.balance, pool.stakingTokenInfo.decimals)}
                            sub={
                                sharePercent === null
                                    ? 'nothing staked yet'
                                    : `${sharePercent.toFixed(2)}% of the pool`
                            }
                            accent={pool.user.balance > 0n}
                        />
                    </div>

                    {pool.user.earned > 0n && (
                        <div className="mt-auto rounded-xl bg-muted/30 px-3 py-2 text-xs">
                            <div className="flex items-baseline justify-between">
                                <span className="text-muted-foreground">Earned</span>
                                <span className="font-medium tabular-nums text-positive">
                                    {formatRewardAmount(
                                        pool.user.earned,
                                        pool.rewardTokenInfo.decimals
                                    )}{' '}
                                    {pool.rewardTokenInfo.symbol}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4 flex gap-2">
                    {isConnected && pool.user.earned > 0n && (
                        <Button
                            className="flex-1"
                            variant="outline"
                            disabled={claim.isPending || claim.isConfirming}
                            isLoading={claim.isPending || claim.isConfirming}
                            onClick={() => {
                                setClaimOpen(true)
                                claim.claim()
                            }}
                        >
                            Claim
                        </Button>
                    )}
                    <Button
                        className="flex-1"
                        variant={status === 'active' ? 'default' : 'outline'}
                        onClick={() => (isConnected ? onManage(pool) : onConnect())}
                    >
                        {isConnected ? 'Manage' : 'Connect Wallet'}
                    </Button>
                    {isCreator && canManagePool && (
                        <Button
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            title="Creator controls"
                            aria-label="Creator controls"
                            onClick={() => onCreatorControls(pool)}
                        >
                            <Settings2 />
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

/** Stake, withdraw and claim for one pool. Balances and allowance come from the lens read. */
function ManagePoolDialog({
    pool,
    open,
    onClose,
    onSuccess,
}: {
    pool: StakingPool | null
    open: boolean
    onClose: () => void
    onSuccess: () => void
}) {
    const now = useNowSeconds()
    const chainId = useChainId()
    const [mode, setMode] = useState<'stake' | 'withdraw'>('stake')
    const [amount, setAmount] = useState('')
    const actions = useStakingPoolActions(pool?.address, pool?.view.stakingToken)
    const [txOpen, setTxOpen] = useState(false)
    // useStakingPoolActions writes approve, stake and withdraw through one hook, so its
    // flags describe whichever call is in flight. These say which step owns them, and
    // carry a landed step past the point where the shared flags move on.
    const [flowKind, setFlowKind] = useState<'stake' | 'withdraw' | 'exit' | 'withdraw-lot'>(
        'stake'
    )
    // What the flow moves, fixed at click time: the input may be cleared, and exit and lot
    // withdrawals never read it.
    const [flowAmount, setFlowAmount] = useState(0n)
    const flowLot = useRef(0n)
    // The step before the main call, if any: an approval ahead of a stake, or a reward claim
    // ahead of a withdrawal so earnings land before the stake leaves.
    const [flowPrep, setFlowPrep] = useState<'approve' | 'claim' | null>(null)
    const [prepDone, setPrepDone] = useState(false)
    const [flowReward, setFlowReward] = useState(0n)
    const [mainDone, setMainDone] = useState(false)
    const { lots } = useStakingLots(pool?.address, open)
    const [lotPage, setLotPage] = useState(1)
    const lotPages = getTotalPages(lots.length, LOTS_PER_PAGE)
    const safeLotPage = clampPage(lotPage, lotPages)
    const pagedLots = paginate(lots, safeLotPage, LOTS_PER_PAGE)

    useEffect(() => {
        if (!open) return
        setMode('stake')
        setAmount('')
        setLotPage(1)
        queuedMain.current = null
        setPrepDone(false)
        setMainDone(false)
    }, [open, pool?.address])

    // One click: the prep step carries the call it was for, so the wallet asks twice but the
    // user never has to come back and press the button again.
    const queuedMain = useRef<(() => void) | null>(null)

    useOnTxSuccess(open, actions.isSuccess, actions.hash, () => {
        const queued = queuedMain.current
        queuedMain.current = null
        if (queued) {
            setPrepDone(true)
            queued()
            return
        }
        setMainDone(true)
        toastSuccess('Transaction confirmed')
        // The tx dialog owns the success frame and closes from its Done button.
        onSuccess()
    })

    useEffect(() => {
        if (actions.error) toastError(actions.error)
    }, [actions.error])

    if (!pool) return null

    const decimals = pool.stakingTokenInfo.decimals
    // Nothing staked means there is nothing to withdraw, so that side is not offered.
    const canWithdraw = pool.user.balance > 0n
    const activeMode = canWithdraw ? mode : 'stake'
    // A capped pool refuses anything past its remaining power, so the cap bounds the input the
    // same way the wallet balance does — the amount can never be one the chain would reject.
    const capped = pool.view.maxStakingPower > 0n
    const room = capped
        ? min(pool.user.stakingBalance, pool.view.remainingStakingPower)
        : pool.user.stakingBalance
    const max = activeMode === 'stake' ? room : pool.user.withdrawable
    const parsed = amount ? parseTokenAmount(amount, decimals) : 0n
    const needsApproval =
        activeMode === 'stake' && parsed > 0n && pool.user.stakingAllowance < parsed
    const isBusy = actions.isPending || actions.isConfirming
    const locked = pool.user.balance - pool.user.withdrawable

    const label = () => {
        if (parsed <= 0n) return 'Enter an amount'
        if (parsed > max) {
            if (activeMode === 'withdraw') return 'Still locked'
            return capped && pool.view.remainingStakingPower < pool.user.stakingBalance
                ? 'Over the pool cap'
                : 'Insufficient balance'
        }
        if (needsApproval) return `Approve & Stake`
        if (activeMode === 'stake') return 'Stake'
        return pool.user.earned > 0n ? 'Claim & Withdraw' : 'Withdraw'
    }

    const sharedFlags = {
        isPending: actions.isPending,
        isConfirming: actions.isConfirming,
        isError: !!actions.error,
        error: actions.error,
        hash: actions.hash,
    }
    const poolSide = {
        kind: 'contract' as const,
        label: `${pool.stakingTokenInfo.symbol} pool`,
        address: pool.address,
        amount: 'Staked',
    }
    const tokenSide = {
        kind: 'token' as const,
        token: pool.stakingTokenInfo,
        amount: formatTokenAmount(flowAmount, decimals),
    }
    const runMain = (kind: typeof flowKind, value: bigint) => {
        if (kind === 'stake') actions.stake(value)
        else if (kind === 'withdraw') actions.withdraw(value)
        else if (kind === 'exit') actions.exit()
        else actions.withdrawFrom(flowLot.current, value)
    }
    const runPrep = (prep: 'approve' | 'claim', kind: typeof flowKind, value: bigint) => {
        queuedMain.current = () => runMain(kind, value)
        if (prep === 'approve') actions.approve()
        else actions.claim()
    }
    const startFlow = (kind: typeof flowKind, value: bigint, approve = false) => {
        // exit() already pays out rewards, so only the plain withdrawals get a claim first.
        const prep = approve
            ? 'approve'
            : kind !== 'stake' && kind !== 'exit' && pool.user.earned > 0n
              ? 'claim'
              : null
        setFlowKind(kind)
        setFlowAmount(value)
        setFlowReward(pool.user.earned)
        setFlowPrep(prep)
        setPrepDone(false)
        setMainDone(false)
        setTxOpen(true)
        if (prep) runPrep(prep, kind, value)
        else runMain(kind, value)
    }
    const MAIN_LABEL: Record<typeof flowKind, string> = {
        stake: 'Stake',
        withdraw: 'Withdraw',
        exit: pool.user.earned > 0n ? 'Withdraw all & claim' : 'Withdraw all',
        'withdraw-lot': 'Withdraw deposit',
    }
    const txSteps: TxStep[] = []
    if (flowPrep === 'approve') {
        txSteps.push({
            label: `Approve ${pool.stakingTokenInfo.symbol}`,
            phase: prepDone ? 'success' : txPhase(sharedFlags),
            hash: prepDone ? undefined : actions.hash,
            error: actions.error,
            run: () => runPrep('approve', flowKind, flowAmount),
            renderStage: (phase) => (
                <TxStageFlow
                    phase={phase}
                    chainId={chainId}
                    from={{ kind: 'token', token: pool.stakingTokenInfo, amount: 'Wallet' }}
                    to={{ ...poolSide, amount: 'Unlimited' }}
                />
            ),
        })
    }
    if (flowPrep === 'claim') {
        txSteps.push({
            label: `Claim ${pool.rewardTokenInfo.symbol} rewards`,
            phase: prepDone ? 'success' : txPhase(sharedFlags),
            hash: prepDone ? undefined : actions.hash,
            error: actions.error,
            run: () => runPrep('claim', flowKind, flowAmount),
            renderStage: (phase) => (
                <TxStageFlow
                    phase={phase}
                    chainId={chainId}
                    hash={prepDone ? undefined : actions.hash}
                    from={{ ...poolSide, amount: 'Earned' }}
                    to={{
                        kind: 'token',
                        token: pool.rewardTokenInfo,
                        amount: formatTokenAmount(flowReward, pool.rewardTokenInfo.decimals),
                    }}
                />
            ),
        })
    }
    txSteps.push({
        label: MAIN_LABEL[flowKind],
        phase: mainDone ? 'success' : flowPrep && !prepDone ? 'idle' : txPhase(sharedFlags),
        hash: flowPrep && !prepDone ? undefined : actions.hash,
        error: actions.error,
        run: () => runMain(flowKind, flowAmount),
        renderStage: (phase) => (
            <TxStageFlow
                phase={phase}
                chainId={chainId}
                hash={actions.hash}
                from={flowKind === 'stake' ? tokenSide : poolSide}
                to={flowKind === 'stake' ? poolSide : tokenSide}
            />
        ),
    })

    return (
        <>
            <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-md border-border/50">
                    <DialogHeader>
                        <DialogTitle className="text-lg">
                            {pool.stakingTokenInfo.symbol} pool
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {canWithdraw && (
                            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/30 p-1">
                                {(['stake', 'withdraw'] as const).map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => {
                                            setMode(m)
                                            setAmount('')
                                            setLotPage(1)
                                        }}
                                        className={`rounded-lg py-1.5 text-sm font-medium capitalize transition-colors ${
                                            mode === m
                                                ? 'bg-background text-foreground'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex items-baseline justify-between">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                    Amount
                                </Label>
                                <button
                                    type="button"
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => setAmount(formatTokenAmount(max, decimals))}
                                >
                                    {activeMode === 'stake'
                                        ? capped &&
                                          pool.view.remainingStakingPower < pool.user.stakingBalance
                                            ? 'Cap room'
                                            : 'Balance'
                                        : 'Unlocked'}
                                    : {formatBalance(max, decimals)}
                                </button>
                            </div>
                            <Input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="any"
                                placeholder="0.0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </div>

                        {activeMode === 'withdraw' && pool.user.withdrawable > 0n && (
                            <Button
                                variant="outline"
                                className="w-full"
                                disabled={isBusy}
                                onClick={() => startFlow('exit', pool.user.withdrawable)}
                            >
                                Withdraw all
                                {pool.user.earned > 0n ? ' & claim' : ''} (
                                {formatBalance(pool.user.withdrawable, decimals)}{' '}
                                {pool.stakingTokenInfo.symbol})
                            </Button>
                        )}

                        {activeMode === 'withdraw' && locked > 0n && (
                            <p className="rounded-xl bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                                {formatBalance(locked, decimals)} {pool.stakingTokenInfo.symbol} is
                                still locked
                                {pool.user.nextUnlockAt > 0n
                                    ? `, unlocking ${formatRelativeTime(Number(pool.user.nextUnlockAt), now)}`
                                    : ''}
                                . Claiming rewards is never locked.
                            </p>
                        )}

                        <Button
                            className="w-full"
                            size="lg"
                            disabled={isBusy || parsed <= 0n || parsed > max}
                            isLoading={isBusy}
                            onClick={() => startFlow(activeMode, parsed, needsApproval)}
                        >
                            {label()}
                        </Button>

                        {activeMode === 'withdraw' && lots.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-baseline justify-between">
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Your deposits
                                    </Label>
                                    <span
                                        className="text-[11px] text-muted-foreground"
                                        title="Every stake is its own lot with its own unlock time, so a later deposit never re-locks an earlier one."
                                    >
                                        {lots.length} lot{lots.length === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    {pagedLots.map((lot) => {
                                        const unlocked = lot.unlockAt <= now
                                        return (
                                            <div
                                                key={lot.index}
                                                className="flex items-center justify-between gap-2 rounded-xl bg-muted/20 px-3 py-2 text-xs"
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-medium tabular-nums">
                                                        {formatBalance(lot.amount, decimals)}{' '}
                                                        {pool.stakingTokenInfo.symbol}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {unlocked
                                                            ? 'unlocked'
                                                            : `unlocks ${formatRelativeTime(lot.unlockAt, now)}`}
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={!unlocked || isBusy}
                                                    onClick={() => {
                                                        flowLot.current = BigInt(lot.index)
                                                        startFlow('withdraw-lot', lot.amount)
                                                    }}
                                                >
                                                    Withdraw
                                                </Button>
                                            </div>
                                        )
                                    })}
                                </div>
                                {lotPages > 1 && (
                                    <PaginationControls
                                        currentPage={safeLotPage}
                                        totalPages={lotPages}
                                        onPageChange={setLotPage}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Its own Radix root, outside this one, so the two modals don't fight over focus. */}
            <TxFlowDialog
                open={txOpen}
                onOpenChange={setTxOpen}
                title={`${pool.stakingTokenInfo.symbol} pool`}
                steps={txSteps}
                chainId={chainId}
                onDone={onClose}
            />
        </>
    )
}

function CreatorControlsDialog({
    pool,
    open,
    onClose,
    onSettled,
}: {
    pool: StakingPool | null
    open: boolean
    onClose: () => void
    onSettled: () => void
}) {
    if (!pool) return null
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-md border-border/50">
                <DialogHeader>
                    <DialogTitle className="text-lg">
                        {pool.stakingTokenInfo.symbol} pool · creator
                    </DialogTitle>
                </DialogHeader>
                <StakingCreatorPanel pool={pool} onSettled={onSettled} />
            </DialogContent>
        </Dialog>
    )
}

export function AddressRow({
    label,
    address,
    chainId,
}: {
    label: string
    address: string
    chainId: number
}) {
    const [copied, setCopied] = useState(false)
    const copy = () => {
        navigator.clipboard.writeText(address)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }
    return (
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="flex items-center gap-2">
                <span className="font-mono text-xs">{formatAddress(address)}</span>
                <button
                    type="button"
                    onClick={copy}
                    title="Copy address"
                    aria-label={`Copy ${label} address`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                >
                    {copied ? (
                        <Check className="h-3.5 w-3.5 text-positive" />
                    ) : (
                        <Copy className="h-3.5 w-3.5" />
                    )}
                </button>
                <a
                    href={`${getChainMetadata(chainId).explorer}/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on explorer"
                    aria-label={`View ${label} on explorer`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </a>
            </span>
        </div>
    )
}

function StatTile({
    label,
    value,
    unit,
    sub,
}: {
    label: string
    value: string
    unit?: string
    sub?: string
}) {
    return (
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
                <span className="truncate text-2xl font-bold tracking-tight">{value}</span>
                {unit && (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {unit}
                    </span>
                )}
            </div>
            {sub && <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>}
        </div>
    )
}

const formatDate = (seconds: bigint) =>
    new Date(Number(seconds) * 1000).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    })

/** The shareable full-screen view of one pool: the same actions as the card, given room to read. */
function PoolDetail({
    pool,
    aprPercent,
    now,
    onManage,
    onCreatorControls,
    onConnect,
}: {
    pool: StakingPool
    aprPercent: number | null
    now: number
    onManage: (pool: StakingPool) => void
    onCreatorControls: (pool: StakingPool) => void
    onConnect: () => void
}) {
    const { address: account, isConnected } = useAccount()
    const chainId = useChainId()
    const { claim, claimOpen, setClaimOpen, claimSteps } = usePoolClaim(pool)
    const { view, user, stakingTokenInfo, rewardTokenInfo } = pool
    const status = getStakingStatus(view, now)
    const isCreator = !!account && account.toLowerCase() === view.creator.toLowerCase()
    const canManagePool = status === 'ended' || status === 'closed'
    const perDay = rewardPerSecond(view, rewardTokenInfo.decimals) * SECONDS_PER_DAY
    const end = Number(view.periodFinish)
    // startTime 0 means the pool started on creation, so the epoch begins one duration before it ends.
    const start = view.startTime > 0n ? Number(view.startTime) : end - Number(view.rewardsDuration)
    const epochPercent =
        end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 0
    const capPercent =
        view.maxStakingPower > 0n
            ? Number((view.totalSupply * 10_000n) / view.maxStakingPower) / 100
            : null
    const sharePercent =
        user.balance > 0n && view.totalSupply > 0n
            ? Number((user.balance * 10_000n) / view.totalSupply) / 100
            : null
    const timeLeft =
        status === 'active'
            ? `Ends ${formatRelativeTime(end, now)}`
            : status === 'pending'
              ? `Starts ${formatRelativeTime(start, now)}`
              : STATUS_LABEL[status]

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href)
        toastSuccess('Link copied')
    }

    return (
        <div className="space-y-6">
            <TxFlowDialog
                open={claimOpen}
                onOpenChange={setClaimOpen}
                title="Claim rewards"
                steps={claimSteps}
                chainId={chainId}
            />

            <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                        <div className="flex shrink-0 items-end">
                            <TokenIcon
                                src={stakingTokenInfo.logo}
                                symbol={stakingTokenInfo.symbol}
                                size="xl"
                            />
                            <TokenIcon
                                src={rewardTokenInfo.logo}
                                symbol={rewardTokenInfo.symbol}
                                size="md"
                                className="-ml-6 ring-4 ring-background"
                            />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                                    Stake {stakingTokenInfo.symbol}
                                </h1>
                                <StatusBadge status={status} />
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                                Earn {rewardTokenInfo.symbol} · {timeLeft}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                                Created by{' '}
                                <a
                                    href={`${getChainMetadata(chainId).explorer}/address/${view.creator}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={view.creator}
                                    className="font-mono hover:text-foreground"
                                >
                                    {formatAddress(view.creator)}
                                </a>
                                {isCreator && ' (you)'}
                            </div>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="shrink-0 self-start sm:self-center"
                        onClick={copyLink}
                    >
                        <Share2 />
                        Share
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                    label="APR"
                    value={formatAprPercent(aprPercent)}
                    sub={view.totalSupply === 0n ? 'no stakers yet' : undefined}
                />
                <StatTile
                    label="Total staked"
                    value={formatBalance(view.totalSupply, stakingTokenInfo.decimals)}
                    unit={stakingTokenInfo.symbol}
                    sub={
                        capPercent === null
                            ? 'no cap'
                            : `${capPercent.toFixed(capPercent >= 10 ? 0 : 1)}% of ${formatBalance(view.maxStakingPower, stakingTokenInfo.decimals)} cap`
                    }
                />
                <StatTile
                    label="Daily reward"
                    value={perDay > 0 ? formatRateAmount(perDay) : '—'}
                    unit={rewardTokenInfo.symbol}
                />
                <StatTile
                    label="Lock"
                    value={
                        view.lockDuration > 0n ? formatDuration(Number(view.lockDuration)) : 'None'
                    }
                    sub={view.lockDuration > 0n ? 'per deposit' : 'withdraw any time'}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                <div className="space-y-6">
                    <Card>
                        <CardContent className="space-y-4 p-5">
                            <div className="flex items-baseline justify-between">
                                <h2 className="font-semibold">Reward epoch #{pool.epoch}</h2>
                                <span className="text-sm text-muted-foreground">{timeLeft}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${epochPercent}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{formatDate(BigInt(start))}</span>
                                <span>{formatDate(view.periodFinish)}</span>
                            </div>
                            {capPercent !== null && (
                                <div className="space-y-1.5 pt-2">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>Staking cap</span>
                                        <span>{capPercent.toFixed(1)}% filled</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                                        <div
                                            className="h-full rounded-full bg-primary/70"
                                            style={{ width: `${Math.min(100, capPercent)}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-5">
                            <h2 className="mb-1 font-semibold">Contracts</h2>
                            <div className="divide-y divide-border/50">
                                <AddressRow label="Pool" address={pool.address} chainId={chainId} />
                                <AddressRow
                                    label={`${stakingTokenInfo.symbol} (stake)`}
                                    address={view.stakingToken}
                                    chainId={chainId}
                                />
                                <AddressRow
                                    label={`${rewardTokenInfo.symbol} (reward)`}
                                    address={view.rewardsToken}
                                    chainId={chainId}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="h-fit lg:sticky lg:top-24">
                    <CardContent className="space-y-5 p-5">
                        <h2 className="font-semibold">Your position</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <Metric
                                label="Staked"
                                unit={stakingTokenInfo.symbol}
                                value={formatBalance(user.balance, stakingTokenInfo.decimals)}
                                sub={
                                    sharePercent === null
                                        ? 'nothing staked yet'
                                        : `${sharePercent.toFixed(2)}% of the pool`
                                }
                                accent={user.balance > 0n}
                            />
                            <Metric
                                label="Earned"
                                unit={rewardTokenInfo.symbol}
                                value={formatRewardAmount(user.earned, rewardTokenInfo.decimals)}
                                accent={user.earned > 0n}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Button
                                variant={status === 'active' ? 'default' : 'outline'}
                                onClick={() => (isConnected ? onManage(pool) : onConnect())}
                            >
                                {isConnected ? 'Stake / Withdraw' : 'Connect Wallet'}
                            </Button>
                            {isConnected && user.earned > 0n && (
                                <Button
                                    variant="outline"
                                    disabled={claim.isPending || claim.isConfirming}
                                    isLoading={claim.isPending || claim.isConfirming}
                                    onClick={() => {
                                        setClaimOpen(true)
                                        claim.claim()
                                    }}
                                >
                                    Claim rewards
                                </Button>
                            )}
                            {isCreator && canManagePool && (
                                <Button variant="outline" onClick={() => onCreatorControls(pool)}>
                                    <Settings2 />
                                    Creator controls
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

/** `poolAddress` narrows the list to that one pool, as the shareable full-screen page. */
export function StakingPools({
    onCreate,
    poolAddress,
}: {
    onCreate?: () => void
    poolAddress?: string
}) {
    const chainId = useChainId()
    const now = useNowSeconds()
    const queryClient = useQueryClient()
    const { pools, isLoading } = useStakingPools()
    const { priceMap } = useTokenPriceMap(chainId)
    const [filter, setFilter] = useState<StakingPoolFilter>('all')
    const [managed, setManaged] = useState<StakingPool | null>(null)
    const [creatorPool, setCreatorPool] = useState<StakingPool | null>(null)
    const [isConnectOpen, setIsConnectOpen] = useState(false)

    const visible = useMemo(
        () =>
            poolAddress
                ? pools.filter((p) => p.address.toLowerCase() === poolAddress.toLowerCase())
                : sortStakingPools(filterStakingPools(pools, filter, now), now),
        [pools, filter, now, poolAddress]
    )

    const { shown, hasMore, sentinelRef } = useInfiniteList(visible, POOLS_PER_BATCH, filter)

    // One transaction for every pool that owes the viewer something.
    const claimable = useMemo(() => pools.filter((p) => p.user.earned > 0n), [pools])
    const batch = useClaimAllStaking()
    // Frozen at click: the claimed pools drop out of `claimable` once balances refetch.
    const [claimAllPools, setClaimAllPools] = useState<StakingPool[] | null>(null)
    const claimAllSteps: TxStep[] = claimAllPools
        ? [
              actionStep({
                  label: `Claim from ${claimAllPools.length} pools`,
                  flags: {
                      isPending: batch.isPending,
                      isConfirming: batch.isConfirming,
                      isSuccess: batch.isSuccess,
                      isError: !!batch.error,
                      error: batch.error,
                      hash: batch.hash,
                  },
                  run: () => batch.claimAll(claimAllPools.map((p) => p.address)),
                  renderStage: (phase) => (
                      <TxStageRecord
                          phase={phase}
                          chainId={chainId}
                          hash={batch.hash}
                          rows={claimAllPools.map(
                              (p) =>
                                  [
                                      `${p.stakingTokenInfo.symbol} pool`,
                                      `${formatTokenAmount(p.user.earned, p.rewardTokenInfo.decimals)} ${p.rewardTokenInfo.symbol}`,
                                  ] as const
                          )}
                      />
                  ),
              }),
          ]
        : []
    useOnTxSuccess(true, batch.isSuccess, batch.hash, () => {
        toastSuccess('Rewards claimed')
        queryClient.invalidateQueries()
    })
    useEffect(() => {
        if (batch.error) toastError(batch.error)
    }, [batch.error])

    // Keep the open dialog pointed at the freshly read pool, so balances update behind it.
    const fresh = (pool: StakingPool | null) =>
        pool ? (pools.find((p) => p.address === pool.address) ?? pool) : null
    const managedPool = fresh(managed)
    const creatorControlsPool = fresh(creatorPool)

    const header = poolAddress ? (
        <Link
            href="/earn?tab=token-staking"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
            <ArrowLeft className="h-4 w-4" />
            All staking pools
        </Link>
    ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold sm:text-xl">Staking Pools</h2>
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl bg-muted/30 p-1">
                    {FILTERS.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            onClick={() => setFilter(f.value)}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                filter === f.value
                                    ? 'bg-background text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                {claimable.length > 1 && (
                    <Button
                        variant="outline"
                        disabled={batch.isPending || batch.isConfirming}
                        isLoading={batch.isPending || batch.isConfirming}
                        loadingText="Claiming..."
                        onClick={() => {
                            setClaimAllPools(claimable)
                            batch.claimAll(claimable.map((p) => p.address))
                        }}
                    >
                        Claim all ({claimable.length})
                    </Button>
                )}
                <TxFlowDialog
                    open={claimAllPools !== null}
                    onOpenChange={(o) => !o && setClaimAllPools(null)}
                    title="Claim all rewards"
                    steps={claimAllSteps}
                    chainId={chainId}
                />
                <Button variant="outline" onClick={onCreate}>
                    <Plus />
                    Create Program
                </Button>
            </div>
        </div>
    )

    if (!getStakingRewards(chainId)) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold sm:text-xl">Staking Pools</h2>
                <EmptyState
                    title="Not available"
                    description="Token staking is not available on this chain."
                />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {header}
            {isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <Card key={i}>
                            <CardContent className="h-64 animate-pulse p-5" />
                        </Card>
                    ))}
                </div>
            ) : visible.length === 0 ? (
                <EmptyState
                    title={pools.length === 0 ? 'No staking pools yet' : 'Nothing matches'}
                    description={
                        poolAddress
                            ? 'This pool was not found on the connected network.'
                            : pools.length === 0
                              ? 'Open the first pool: pick a token to stake, a reward and a schedule.'
                              : 'No pool matches this filter.'
                    }
                    action={
                        pools.length === 0 && !poolAddress && onCreate ? (
                            <Button variant="outline" onClick={onCreate}>
                                <Plus />
                                Create Program
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <>
                    <div
                        className={cn(
                            'grid grid-cols-1 gap-4',
                            !poolAddress && 'sm:grid-cols-2 lg:grid-cols-3'
                        )}
                    >
                        {shown.map((pool) => {
                            const Item = poolAddress ? PoolDetail : PoolCard
                            return (
                                <Item
                                    key={pool.address}
                                    pool={pool}
                                    now={now}
                                    aprPercent={getStakingApr(pool, {
                                        stakingUsd: priceMap.get(
                                            pool.view.stakingToken.toLowerCase()
                                        ),
                                        rewardUsd: priceMap.get(
                                            pool.view.rewardsToken.toLowerCase()
                                        ),
                                    })}
                                    onManage={setManaged}
                                    onCreatorControls={setCreatorPool}
                                    onConnect={() => setIsConnectOpen(true)}
                                    fullPage={!!poolAddress}
                                />
                            )
                        })}
                    </div>
                    {hasMore && <div ref={sentinelRef} className="h-10" aria-hidden />}
                </>
            )}
            <ManagePoolDialog
                pool={managedPool}
                open={managed !== null}
                onClose={() => setManaged(null)}
                onSuccess={() => queryClient.invalidateQueries()}
            />
            <CreatorControlsDialog
                pool={creatorControlsPool}
                open={creatorPool !== null}
                onClose={() => setCreatorPool(null)}
                onSettled={() => queryClient.invalidateQueries()}
            />
            <ConnectModal open={isConnectOpen} onOpenChange={setIsConnectOpen} />
        </div>
    )
}
