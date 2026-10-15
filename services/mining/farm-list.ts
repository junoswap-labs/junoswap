import type {
    FarmOwnershipFilter,
    FarmSortKey,
    FarmStatusFilter,
    FarmView,
    Incentive,
    MyFarmFilter,
} from '@/types/earn'

/** Card view is two rows of three, so the sections below the list stay in reach; the table trades density for the same space. */
export const FARM_PAGE_SIZE: Record<FarmView, number> = {
    card: 6,
    table: 10,
}

export const DEFAULT_FARM_SORT: FarmSortKey = 'reward-value'
export const DEFAULT_FARM_VIEW: FarmView = 'card'
/** Finished farms are history, so the list opens on what can still be joined. */
export const DEFAULT_FARM_STATUSES: readonly FarmStatusFilter[] = ['active', 'upcoming']

export const FARM_SORT_OPTIONS: readonly { key: FarmSortKey; label: string }[] = [
    { key: 'reward-value', label: 'Reward Value' },
    { key: 'newest', label: 'Newest' },
    { key: 'opening-soon', label: 'Opening Soon' },
    { key: 'ending-soon', label: 'Ending Soon' },
]

export const FARM_STATUS_OPTIONS: readonly { key: FarmStatusFilter; label: string }[] = [
    { key: 'active', label: 'Running' },
    { key: 'upcoming', label: 'Scheduled' },
    { key: 'ended', label: 'Ended' },
]

export const FARM_OWNERSHIP_OPTIONS: readonly { key: FarmOwnershipFilter; label: string }[] = [
    { key: 'my-staked', label: 'My Staked' },
    { key: 'match-my-position', label: 'Match My Position' },
]

export const MY_FARM_FILTER_OPTIONS: readonly { key: MyFarmFilter; label: string }[] = [
    { key: 'ongoing', label: 'On Going' },
    { key: 'unclaimed', label: 'Unclaimed' },
    { key: 'ended', label: 'Ended' },
]

export const DEFAULT_MY_FARM_FILTER: MyFarmFilter = 'ongoing'

export type FarmStatus = 'pending' | 'active' | 'ended'

export interface FarmListContext {
    now: number
    /** USD value of each farm's undistributed reward, keyed by incentiveId. */
    rewardValueUsd?: Record<string, number | undefined>
    stakedIncentiveIds?: ReadonlySet<string>
    /** Lowercased pool addresses the wallet holds an LP position in. */
    myPoolAddresses?: ReadonlySet<string>
}

export interface FarmFilters {
    status: readonly FarmStatusFilter[]
    ownership: readonly FarmOwnershipFilter[]
}

/** Status against an injected clock, so list ordering stays testable and tick-aligned. */
export function getFarmStatusAt(incentive: Incentive, now: number): FarmStatus {
    if (now < incentive.startTime) return 'pending'
    if (now >= incentive.endTime) return 'ended'
    return 'active'
}

const STATUS_BY_FILTER: Record<FarmStatusFilter, FarmStatus> = {
    active: 'active',
    upcoming: 'pending',
    ended: 'ended',
}

export function filterFarms(
    incentives: readonly Incentive[],
    filters: FarmFilters,
    ctx: FarmListContext
): Incentive[] {
    return incentives.filter((incentive) => {
        if (filters.status.length > 0) {
            const status = getFarmStatusAt(incentive, ctx.now)
            if (!filters.status.some((f) => STATUS_BY_FILTER[f] === status)) return false
        }
        // Selected ownership filters widen the list: a farm passes if it satisfies any of them.
        if (filters.ownership.length > 0) {
            const matches = filters.ownership.some((f) =>
                f === 'my-staked'
                    ? !!ctx.stakedIncentiveIds?.has(incentive.incentiveId)
                    : !!ctx.myPoolAddresses?.has(incentive.pool.toLowerCase())
            )
            if (!matches) return false
        }
        return true
    })
}

/**
 * "Unclaimed" is the actionable slice: finished farms whose leftover reward is still sitting in the
 * staker waiting to come back. A finished farm that paid out in full is only history, so it lives
 * under "Ended" alone.
 */
export function filterMyFarms(
    incentives: readonly Incentive[],
    filter: MyFarmFilter,
    now: number
): Incentive[] {
    return incentives.filter((incentive) => {
        const status = getFarmStatusAt(incentive, now)
        switch (filter) {
            case 'ongoing':
                return status !== 'ended'
            case 'unclaimed':
                return status === 'ended' && incentive.totalRewardUnclaimed > 0n
            case 'ended':
                return status === 'ended'
        }
    })
}

function compareNewest(a: Incentive, b: Incentive): number {
    return (b.createdAt ?? b.startTime) - (a.createdAt ?? a.startTime)
}

/** Farms still waiting to open come first, soonest first; everything already open trails behind. */
function compareOpeningSoon(a: Incentive, b: Incentive, now: number): number {
    const aWaiting = a.startTime > now
    const bWaiting = b.startTime > now
    if (aWaiting !== bWaiting) return aWaiting ? -1 : 1
    return aWaiting ? a.startTime - b.startTime : b.startTime - a.startTime
}

/** Farms still running come first, soonest to finish first; finished ones trail behind. */
function compareEndingSoon(a: Incentive, b: Incentive, now: number): number {
    const aLive = a.endTime > now
    const bLive = b.endTime > now
    if (aLive !== bLive) return aLive ? -1 : 1
    return aLive ? a.endTime - b.endTime : b.endTime - a.endTime
}

/** Rewards priced in different tokens are only comparable in USD, so unpriced farms sink. */
function compareRewardValue(
    a: Incentive,
    b: Incentive,
    values: Record<string, number | undefined> | undefined
): number {
    const aValue = values?.[a.incentiveId]
    const bValue = values?.[b.incentiveId]
    if (aValue == null && bValue == null) return 0
    if (aValue == null) return 1
    if (bValue == null) return -1
    return bValue - aValue
}

export function sortFarms(
    incentives: readonly Incentive[],
    sortKey: FarmSortKey,
    ctx: FarmListContext
): Incentive[] {
    const compare = (a: Incentive, b: Incentive): number => {
        switch (sortKey) {
            case 'newest':
                return compareNewest(a, b)
            case 'opening-soon':
                return compareOpeningSoon(a, b, ctx.now)
            case 'ending-soon':
                return compareEndingSoon(a, b, ctx.now)
            case 'reward-value':
                return compareRewardValue(a, b, ctx.rewardValueUsd)
        }
    }
    return [...incentives].sort(
        (a, b) => compare(a, b) || a.incentiveId.localeCompare(b.incentiveId)
    )
}

export function getTotalPages(count: number, pageSize: number): number {
    if (count <= 0 || pageSize <= 0) return 1
    return Math.ceil(count / pageSize)
}

export function clampPage(page: number, totalPages: number): number {
    if (!Number.isFinite(page)) return 1
    return Math.min(Math.max(Math.trunc(page), 1), Math.max(totalPages, 1))
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): T[] {
    if (pageSize <= 0) return [...items]
    const safePage = clampPage(page, getTotalPages(items.length, pageSize))
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
}
