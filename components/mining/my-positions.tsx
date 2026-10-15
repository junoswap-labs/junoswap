'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Maximize2 } from 'lucide-react'
import { useAccount, useChainId } from 'wagmi'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { PaginationControls } from '@/components/ui/pagination'
import { TokenIcon, TokenIconPair } from '@/components/ui/token-icon'
import { useIncentives } from '@/hooks/useIncentives'
import { useStakerDeposits } from '@/hooks/useStakerDeposits'
import { useFarmStakes, toStakedPosition } from '@/hooks/useFarmStakes'
import { usePendingRewardsMultiple } from '@/hooks/useRewards'
import { useWithdrawPosition } from '@/hooks/useStaking'
import { useNowSeconds } from '@/hooks/useNowSeconds'
import { clampPage, getFarmStatusAt, getTotalPages, paginate } from '@/services/mining/farm-list'
import { formatRelativeTime } from '@/lib/duration'
import { formatRewardAmount, formatRateAmount } from '@/lib/format'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { formatFeeTier } from '@/lib/liquidity-helpers'
import { formatBalance, getDisplayToken } from '@/lib/tokens'
import { getChainMetadata } from '@/lib/wagmi'
import { markUnstaked } from '@/lib/optimistic-deposits'
import { toastError, toastSuccess } from '@/lib/toast'
import { getStakerAddress } from '@/lib/earn-programs'
import { TxFlowDialog, actionStep } from '@/components/ui/tx-flow-dialog'
import { TxStageFlow } from '@/components/ui/tx-stage'
import type { PositionWithTokens, StakedPosition } from '@/types/earn'
import type { EarnProgram } from '@/lib/earn-programs'

const POSITIONS_PER_PAGE = 6

function PositionHeader({
    position,
    farmHref,
}: {
    position: PositionWithTokens
    /** A staked position links to the farm it earns from; an idle one has none. */
    farmHref?: string
}) {
    const token0 = getDisplayToken(position.token0Info)
    const token1 = getDisplayToken(position.token1Info)
    return (
        <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <TokenIconPair
                    src0={token0.logo}
                    symbol0={token0.symbol}
                    src1={token1.logo}
                    symbol1={token1.symbol}
                    size="md"
                    className="shrink-0"
                />
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">
                            {token0.symbol} / {token1.symbol}
                        </span>
                        {farmHref && (
                            <Link
                                href={farmHref}
                                title="Open farm full screen"
                                aria-label="Open farm full screen"
                                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <Maximize2 className="h-3.5 w-3.5" />
                            </Link>
                        )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">#{position.tokenId.toString()}</span>
                        <Badge variant="outline" className="shrink-0 text-xs">
                            {formatFeeTier(position.fee)}
                        </Badge>
                    </div>
                </div>
            </div>
            {position.inRange ? (
                <Badge
                    variant="outline"
                    className="shrink-0 bg-positive/10 text-positive border-positive/20"
                >
                    In Range
                </Badge>
            ) : (
                <Badge variant="outline" className="shrink-0 text-muted-foreground">
                    Out of Range
                </Badge>
            )}
        </div>
    )
}

function PositionAmounts({ position }: { position: PositionWithTokens }) {
    return (
        <div className="text-sm text-muted-foreground">
            {formatBalance(position.amount0, position.token0Info.decimals)}{' '}
            {getDisplayToken(position.token0Info).symbol} +{' '}
            {formatBalance(position.amount1, position.token1Info.decimals)}{' '}
            {getDisplayToken(position.token1Info).symbol}
        </div>
    )
}

function StakedPositionCard({
    staked,
    pendingReward,
    dailyRate,
    now,
    onUnstake,
}: {
    staked: StakedPosition
    pendingReward: bigint
    dailyRate: number | undefined
    now: number
    onUnstake: (staked: StakedPosition) => void
}) {
    const { incentive, position } = staked
    const chainId = useChainId()
    const rewardToken = getDisplayToken(incentive.rewardTokenInfo)
    const status = getFarmStatusAt(incentive, now)

    return (
        <Card className="flex flex-col">
            <CardContent className="flex flex-1 flex-col p-5">
                <PositionHeader
                    position={position}
                    farmHref={`/earn/farm/${incentive.incentiveId}?chain=${chainId}`}
                />
                <div className="mt-3">
                    <PositionAmounts position={position} />
                </div>

                <Separator className="my-4" />

                <div className="flex flex-1 flex-col gap-3 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">Earning</span>
                        <span className="inline-flex items-center gap-1.5">
                            <TokenIcon
                                src={rewardToken.logo}
                                symbol={rewardToken.symbol}
                                size="xs"
                            />
                            {rewardToken.symbol}
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="text-muted-foreground underline decoration-dotted underline-offset-2">
                                    Unclaimed
                                </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-64 normal-case">
                                Your share of the farm&apos;s reward, based on your liquidity as a
                                fraction of the pool&apos;s total in-range liquidity — other LPs in
                                this price range reduce your share even if they aren&apos;t staked.
                            </TooltipContent>
                        </Tooltip>
                        <span className="font-mono font-semibold tabular-nums">
                            {formatRewardAmount(pendingReward, incentive.rewardTokenInfo.decimals)}{' '}
                            {rewardToken.symbol}
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">Daily reward</span>
                        <span className="text-right text-xs text-muted-foreground tabular-nums">
                            {dailyRate
                                ? `≈ ${formatRateAmount(dailyRate, rewardToken.symbol)} / day`
                                : '—'}
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">Farm</span>
                        <span className="text-right text-xs text-muted-foreground">
                            {status === 'ended' ? 'Ended ' : 'Ends '}
                            {formatRelativeTime(incentive.endTime, now)}
                        </span>
                    </div>
                </div>

                <Button className="mt-4 w-full" onClick={() => onUnstake(staked)}>
                    Unstake &amp; Claim
                </Button>
            </CardContent>
        </Card>
    )
}

function IdlePositionCard({
    position,
    program,
    onWithdrawn,
}: {
    position: PositionWithTokens
    program: EarnProgram
    onWithdrawn: () => void
}) {
    const { address } = useAccount()
    const chainId = useChainId()
    const [processedTxHash, setProcessedTxHash] = useState<`0x${string}` | null>(null)
    const [txOpen, setTxOpen] = useState(false)
    const { withdraw, isPreparing, isExecuting, isConfirming, isSuccess, error, hash } =
        useWithdrawPosition(position.tokenId, address, program)

    useEffect(() => {
        if (!isSuccess || !hash || hash === processedTxHash) return
        setProcessedTxHash(hash)
        if (address) markUnstaked(chainId, address, position.tokenId)
        const explorer = getChainMetadata(chainId).explorer
        toastSuccess('Position returned to your wallet', {
            action: {
                label: 'View Transaction',
                onClick: () => window.open(`${explorer}/tx/${hash}`, '_blank'),
            },
        })
        onWithdrawn()
    }, [isSuccess, hash, processedTxHash, address, chainId, position.tokenId, onWithdrawn])

    const handleWithdraw = () => {
        setTxOpen(true)
        withdraw()
    }
    // withdrawToken pulls a deposit that is staked in nothing back out of the staker.
    const txSteps = [
        actionStep({
            label: `Withdraw position #${position.tokenId.toString()}`,
            flags: {
                isPending: isPreparing || isExecuting,
                isConfirming,
                isSuccess,
                isError: !!error,
                error,
                hash,
            },
            run: withdraw,
            renderStage: (phase) => (
                <TxStageFlow
                    phase={phase}
                    chainId={chainId}
                    hash={hash}
                    from={{
                        kind: 'contract',
                        label: 'Farm staker',
                        address: getStakerAddress(chainId, program),
                        amount: 'Deposited',
                    }}
                    to={{
                        kind: 'position',
                        tokenId: position.tokenId,
                        feeTier: position.fee,
                        inRange: position.inRange,
                        token0: position.token0Info,
                        token1: position.token1Info,
                    }}
                />
            ),
        }),
    ]

    useEffect(() => {
        if (error) toastError(error)
    }, [error])

    const isBusy = isPreparing || isExecuting || isConfirming
    const label = isExecuting
        ? 'Confirm in wallet...'
        : isConfirming
          ? 'Withdrawing...'
          : 'Withdraw NFT'

    return (
        <Card className="flex flex-col">
            <CardContent className="flex flex-1 flex-col p-5">
                <PositionHeader position={position} />
                <div className="mt-3">
                    <PositionAmounts position={position} />
                </div>

                <Separator className="my-4" />

                <p className="flex-1 text-sm text-muted-foreground">
                    Held by the staker but not staked in any farm, so it is earning no rewards.
                    Stake it in a farm or withdraw it back to your wallet.
                </p>

                <Button
                    className="mt-4 w-full"
                    variant="outline"
                    onClick={handleWithdraw}
                    disabled={isBusy}
                    isLoading={isBusy}
                    loadingText={label}
                >
                    {label}
                </Button>
            </CardContent>

            <TxFlowDialog
                open={txOpen}
                onOpenChange={setTxOpen}
                title="Withdraw position"
                steps={txSteps}
                chainId={chainId}
            />
        </Card>
    )
}

/**
 * The other half of staking: everything the wallet has sitting inside the staker. Without it a
 * deposited NFT has no route back out, since the staker — not the wallet — owns it after a stake.
 */
export function MyPositions({ onUnstake }: { onUnstake: (staked: StakedPosition) => void }) {
    const { address, isConnected } = useAccount()
    const now = useNowSeconds()
    const [page, setPage] = useState(1)

    const { incentives } = useIncentives()
    const { deposits, isLoading: isLoadingDeposits, refetch } = useStakerDeposits()
    const { stakes, isLoading: isLoadingStakes } = useFarmStakes(incentives, deposits)
    const isLoading = isLoadingDeposits || isLoadingStakes

    const owner = address?.toLowerCase()
    const myStakes = useMemo(
        () => (owner ? stakes.filter((s) => s.depositor.toLowerCase() === owner) : []),
        [stakes, owner]
    )
    const stakedPositions = useMemo(() => myStakes.map(toStakedPosition), [myStakes])
    const { rewards, dailyRates } = usePendingRewardsMultiple(stakedPositions)

    const idlePositions = useMemo(() => {
        if (!owner) return []
        // numberOfStakes is authoritative; inferring "idle" from resolved farms mislabels a staked
        // NFT whenever its farm hasn't loaded (or can't be resolved), and withdrawToken then reverts.
        return deposits
            .filter((d) => d.depositor.toLowerCase() === owner)
            .filter((d) => d.numberOfStakes === 0)
    }, [deposits, owner])

    type Entry =
        | { kind: 'staked'; key: string; staked: StakedPosition }
        | { kind: 'idle'; key: string; position: PositionWithTokens; program: EarnProgram }

    const entries = useMemo<Entry[]>(() => {
        const staked = stakedPositions.map<Entry>((s) => ({
            kind: 'staked',
            key: `${s.tokenId.toString()}-${s.incentiveId}`,
            staked: s,
        }))
        const idle = idlePositions.map<Entry>((d) => ({
            kind: 'idle',
            key: `idle-${d.program}-${d.position.tokenId.toString()}`,
            position: d.position,
            program: d.program,
        }))
        return [...staked, ...idle]
    }, [stakedPositions, idlePositions])

    const totalPages = getTotalPages(entries.length, POSITIONS_PER_PAGE)
    const safePage = clampPage(page, totalPages)
    const pageItems = paginate(entries, safePage, POSITIONS_PER_PAGE)

    if (!isConnected || isLoading || entries.length === 0) return null

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold sm:text-xl">My Staked Positions</h2>
                <span className="text-sm text-muted-foreground">
                    {stakedPositions.length} staked
                    {idlePositions.length > 0 && ` · ${idlePositions.length} idle`}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pageItems.map((entry) =>
                    entry.kind === 'staked' ? (
                        <StakedPositionCard
                            key={entry.key}
                            staked={entry.staked}
                            pendingReward={rewards.get(entry.key) ?? 0n}
                            dailyRate={dailyRates.get(entry.key)}
                            now={now}
                            onUnstake={onUnstake}
                        />
                    ) : (
                        <IdlePositionCard
                            key={entry.key}
                            position={entry.position}
                            program={entry.program}
                            onWithdrawn={refetch}
                        />
                    )
                )}
            </div>

            <PaginationControls
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
            />
        </div>
    )
}
