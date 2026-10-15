'use client'

import { EARN_PROGRAM_BADGE, getAvailablePrograms, type EarnProgram } from '@/lib/earn-programs'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PaginationControls } from '@/components/ui/pagination'
import { TokenIconSkeleton } from '@/components/ui/token-icon'
import { ConnectModal } from '@/components/web3/connect-modal'
import { MiningFarmCard } from './farm-card'
import { FarmListToolbar, FarmMultiSelectMenu } from './farm-list-toolbar'
import { FarmTable } from './farm-table'
import { useIncentives } from '@/hooks/useIncentives'
import { useIncentiveRewardValues } from '@/hooks/useIncentiveRewardValues'
import { useFarmOwnership } from '@/hooks/useFarmOwnership'
import { useFarmStats } from '@/hooks/useFarmStats'
import { toStakedPosition, useFarmStakes } from '@/hooks/useFarmStakes'
import { usePendingRewardsMultiple } from '@/hooks/useRewards'
import { formatRewardAmount } from '@/lib/format'
import { getDisplayToken } from '@/lib/tokens'
import { useStakerDeposits } from '@/hooks/useStakerDeposits'
import { useNowSeconds } from '@/hooks/useNowSeconds'
import {
    DEFAULT_FARM_SORT,
    DEFAULT_FARM_STATUSES,
    FARM_PAGE_SIZE,
    DEFAULT_FARM_VIEW,
    FARM_OWNERSHIP_OPTIONS,
    FARM_STATUS_OPTIONS,
    clampPage,
    filterFarms,
    getFarmStatusAt,
    getTotalPages,
    paginate,
    sortFarms,
} from '@/services/mining/farm-list'
import type {
    FarmOwnershipFilter,
    FarmSortKey,
    FarmStatusFilter,
    FarmView,
    Incentive,
} from '@/types/earn'

function FarmCardSkeleton() {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="animate-pulse space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                                <TokenIconSkeleton size="md" />
                                <TokenIconSkeleton size="md" />
                            </div>
                            <div className="space-y-1.5">
                                <div className="h-4 w-28 bg-muted rounded" />
                                <div className="h-3 w-20 bg-muted rounded" />
                            </div>
                        </div>
                        <div className="h-5 w-16 bg-muted rounded-full" />
                    </div>
                    <div className="h-[1px] bg-muted" />
                    <div className="grid grid-cols-2 gap-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="space-y-2">
                                <div className="h-3 w-16 bg-muted rounded" />
                                <div className="h-5 w-20 bg-muted rounded" />
                            </div>
                        ))}
                    </div>
                    <div className="h-9 w-full bg-muted rounded-xl" />
                </div>
            </CardContent>
        </Card>
    )
}

const EMPTY_FILTER_COPY: Record<
    FarmOwnershipFilter | 'all',
    { title: string; description: string }
> = {
    all: {
        title: 'Nothing here right now',
        description: 'No farms match this filter.',
    },
    'my-staked': {
        title: 'No staked farms',
        description: 'Farms you have an LP position staked in will show up here.',
    },
    'match-my-position': {
        title: 'No matching farms',
        description: 'None of the pools you provide liquidity to are being rewarded right now.',
    },
}

export function MiningFarms({
    onStake,
    onUnstake,
    onAddLiquidity,
    onCreate,
}: {
    onStake: (incentive: Incentive) => void
    onUnstake: (incentive: Incentive) => void
    onAddLiquidity: (incentive: Incentive) => void
    onCreate: () => void
}) {
    const chainId = useChainId()
    const { address, isConnected } = useAccount()
    const availablePrograms = getAvailablePrograms(chainId)
    const hasStaker = availablePrograms.length > 0
    const programOptions: readonly { key: EarnProgram; label: string }[] = availablePrograms.map(
        (program) => ({ key: program, label: EARN_PROGRAM_BADGE[program].label })
    )
    const now = useNowSeconds()

    const { incentives, isLoading } = useIncentives()
    const { valueByIncentiveId } = useIncentiveRewardValues(incentives)
    const { statsByIncentiveId } = useFarmStats(incentives, valueByIncentiveId)

    // An ended farm has nothing left to do for someone who neither made it nor stakes in it, and
    // for someone still staked in it the only thing left is the reward they have not claimed.
    const { deposits, isLoading: isLoadingDeposits } = useStakerDeposits()
    const { stakes, isLoading: isLoadingStakes } = useFarmStakes(incentives, deposits)
    const myStaked = useMemo(
        () =>
            stakes
                .filter((s) => s.depositor.toLowerCase() === address?.toLowerCase())
                .map(toStakedPosition),
        [stakes, address]
    )
    const { rewards: pendingRewards } = usePendingRewardsMultiple(myStaked)
    const unclaimedLabel = useMemo(() => {
        const totals = new Map<string, bigint>()
        for (const sp of myStaked) {
            const reward = pendingRewards.get(`${sp.tokenId.toString()}-${sp.incentiveId}`) ?? 0n
            totals.set(sp.incentiveId, (totals.get(sp.incentiveId) ?? 0n) + reward)
        }
        return (incentive: Incentive) => {
            const total = totals.get(incentive.incentiveId)
            if (total === undefined || getFarmStatusAt(incentive, now) !== 'ended') return undefined
            return `Unclaimed ${formatRewardAmount(total, incentive.rewardTokenInfo.decimals)} ${getDisplayToken(incentive.rewardTokenInfo).symbol}`
        }
    }, [myStaked, pendingRewards, now])
    const showActions = useMemo(() => {
        const owner = address?.toLowerCase()
        return (incentive: Incentive) =>
            getFarmStatusAt(incentive, now) !== 'ended' ||
            (!!owner && incentive.refundee.toLowerCase() === owner) ||
            unclaimedLabel(incentive) !== undefined
    }, [address, now, unclaimedLabel])

    const [view, setView] = useState<FarmView>(DEFAULT_FARM_VIEW)
    const [sort, setSort] = useState<FarmSortKey>(DEFAULT_FARM_SORT)
    const [status, setStatus] = useState<readonly FarmStatusFilter[]>(DEFAULT_FARM_STATUSES)
    const [ownership, setOwnership] = useState<readonly FarmOwnershipFilter[]>([])
    const [programFilter, setProgramFilter] = useState<readonly EarnProgram[]>([])
    const [page, setPage] = useState(1)
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)

    // Staking moves the NFT into the staker, so the wallet-held sweep alone misses every position
    // already farming. The on-chain deposits and stakes above answer both filters instead.
    const stakedIncentiveIds = useMemo(
        () => new Set(myStaked.map((sp) => sp.incentiveId)),
        [myStaked]
    )
    const { myPoolAddresses: walletPoolAddresses, isLoading: isLoadingWallet } = useFarmOwnership(
        incentives,
        ownership.includes('match-my-position') ? 'match-my-position' : 'all'
    )
    const myPoolAddresses = useMemo(() => {
        const owner = address?.toLowerCase()
        const pools = new Set(walletPoolAddresses)
        for (const d of deposits) {
            if (d.depositor.toLowerCase() === owner) pools.add(d.position.poolAddress.toLowerCase())
        }
        return pools
    }, [walletPoolAddresses, deposits, address])
    const isLoadingOwnership =
        isLoadingWallet ||
        (ownership.includes('my-staked') && (isLoadingDeposits || isLoadingStakes))

    useEffect(() => {
        setPage(1)
    }, [view, sort, status, ownership, programFilter])

    const byProgram = useMemo(
        () =>
            programFilter.length === 0
                ? incentives
                : incentives.filter((i) => programFilter.includes(i.program)),
        [incentives, programFilter]
    )

    const visible = useMemo(() => {
        const ctx = {
            now,
            rewardValueUsd: valueByIncentiveId,
            stakedIncentiveIds,
            myPoolAddresses,
        }
        return sortFarms(filterFarms(byProgram, { status, ownership }, ctx), sort, ctx)
    }, [
        byProgram,
        status,
        ownership,
        sort,
        now,
        valueByIncentiveId,
        stakedIncentiveIds,
        myPoolAddresses,
    ])

    const pageSize = FARM_PAGE_SIZE[view]
    const totalPages = getTotalPages(visible.length, pageSize)
    const safePage = clampPage(page, totalPages)
    const pageItems = paginate(visible, safePage, pageSize)

    const createButton = (
        <Button
            variant="outline"
            onClick={() => {
                if (!isConnected) {
                    setIsConnectModalOpen(true)
                    return
                }
                onCreate()
            }}
        >
            <Plus />
            Create Program
        </Button>
    )

    if (!hasStaker) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold sm:text-xl">Mining Farms</h2>
                <EmptyState
                    title="Not available"
                    description="LP Mining is not available on this chain."
                />
            </div>
        )
    }

    const isBusy = isLoading || isLoadingOwnership

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-lg font-semibold sm:text-xl">Mining Farms</h2>
                <FarmListToolbar
                    sort={sort}
                    onSortChange={setSort}
                    view={view}
                    onViewChange={setView}
                    filters={
                        <>
                            {programOptions.length > 1 && (
                                <FarmMultiSelectMenu
                                    value={programFilter}
                                    options={programOptions}
                                    onChange={setProgramFilter}
                                    allLabel="All Rewards"
                                    ariaLabel="Filter by reward model"
                                />
                            )}
                            <FarmMultiSelectMenu
                                value={status}
                                options={FARM_STATUS_OPTIONS}
                                onChange={setStatus}
                                allLabel="All Status"
                                ariaLabel="Filter by status"
                            />
                            {isConnected && (
                                <FarmMultiSelectMenu
                                    value={ownership}
                                    options={FARM_OWNERSHIP_OPTIONS}
                                    onChange={setOwnership}
                                    allLabel="All Farms"
                                    ariaLabel="Filter farms"
                                />
                            )}
                        </>
                    }
                >
                    {createButton}
                </FarmListToolbar>
            </div>

            {isBusy ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <FarmCardSkeleton key={i} />
                    ))}
                </div>
            ) : incentives.length === 0 ? (
                <EmptyState
                    title="No mining farms yet"
                    description="Reward liquidity providers in any pool by funding the first farm."
                    action={createButton}
                />
            ) : visible.length === 0 ? (
                <EmptyState
                    {...EMPTY_FILTER_COPY[ownership.length === 1 ? ownership[0]! : 'all']}
                />
            ) : (
                <div className="space-y-4">
                    {view === 'card' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pageItems.map((incentive) => (
                                <MiningFarmCard
                                    key={incentive.incentiveId}
                                    incentive={incentive}
                                    stats={statsByIncentiveId[incentive.incentiveId]}
                                    onStake={onStake}
                                    onUnstake={onUnstake}
                                    onAddLiquidity={onAddLiquidity}
                                    showActions={showActions(incentive)}
                                    unclaimed={unclaimedLabel(incentive)}
                                />
                            ))}
                        </div>
                    ) : (
                        <FarmTable
                            incentives={pageItems}
                            rewardValueUsd={valueByIncentiveId}
                            statsByIncentiveId={statsByIncentiveId}
                            now={now}
                            onStake={onStake}
                            onUnstake={onUnstake}
                            onAddLiquidity={onAddLiquidity}
                            showActions={showActions}
                            unclaimed={unclaimedLabel}
                            onConnect={() => setIsConnectModalOpen(true)}
                        />
                    )}
                    <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
                        <p className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                            Showing {(safePage - 1) * pageSize + 1}–
                            {(safePage - 1) * pageSize + pageItems.length} of {visible.length}
                        </p>
                        <PaginationControls
                            currentPage={safePage}
                            totalPages={totalPages}
                            onPageChange={setPage}
                        />
                    </div>
                </div>
            )}
            <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
        </div>
    )
}
