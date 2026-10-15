import { describe, it, expect } from 'vitest'
import {
    FARM_PAGE_SIZE,
    clampPage,
    filterFarms,
    filterMyFarms,
    getFarmStatusAt,
    getTotalPages,
    paginate,
    sortFarms,
} from '@/services/mining/farm-list'
import { extractIncentiveCreatedAt } from '@/services/mining/incentives'
import type { Incentive } from '@/types/earn'
import type { Token } from '@/types/token'

const NOW = 1_700_000_000
const DAY = 86_400

const token: Token = {
    address: '0x3333333333333333333333333333333333333333',
    symbol: 'JUNO',
    name: 'JUNO',
    decimals: 18,
    chainId: 96,
}

interface FarmSpec {
    id: string
    pool?: string
    startTime?: number
    endTime?: number
    createdAt?: number | null
    stakes?: number
    unclaimed?: bigint
}

function farm({
    id,
    pool = '0xpool1',
    startTime = NOW - DAY,
    endTime = NOW + DAY,
    createdAt = null,
    stakes = 0,
    unclaimed = 10n ** 18n,
}: FarmSpec): Incentive {
    return {
        incentiveId: id as `0x${string}`,
        program: 'v3',
        rewardToken: token.address as `0x${string}`,
        pool: pool as `0x${string}`,
        startTime,
        endTime,
        refundee: '0x1111111111111111111111111111111111111111',
        totalRewardUnclaimed: unclaimed,
        totalSecondsClaimedX128: 0n,
        numberOfStakes: stakes,
        rewardTokenInfo: token,
        poolToken0: token,
        poolToken1: token,
        poolFee: 3000,
        isActive: true,
        isEnded: false,
        createdAt,
    }
}

const ids = (list: Incentive[]) => list.map((i) => i.incentiveId)

describe('getFarmStatusAt', () => {
    it('splits on the start and end boundaries the staker uses', () => {
        const f = farm({ id: '0xa', startTime: NOW, endTime: NOW + DAY })
        expect(getFarmStatusAt(f, NOW - 1)).toBe('pending')
        expect(getFarmStatusAt(f, NOW)).toBe('active')
        expect(getFarmStatusAt(f, NOW + DAY - 1)).toBe('active')
        expect(getFarmStatusAt(f, NOW + DAY)).toBe('ended')
    })
})

describe('filterFarms', () => {
    const running = farm({ id: '0xa', startTime: NOW - DAY, endTime: NOW + DAY })
    const scheduled = farm({ id: '0xb', startTime: NOW + DAY, endTime: NOW + 2 * DAY })
    const ended = farm({ id: '0xc', startTime: NOW - 2 * DAY, endTime: NOW - DAY })
    const all = [running, scheduled, ended]

    it('passes everything through on the default filters', () => {
        expect(filterFarms(all, { status: [], ownership: [] }, { now: NOW })).toHaveLength(3)
    })

    it('filters by status', () => {
        const pick = (status: 'active' | 'upcoming' | 'ended') =>
            ids(filterFarms(all, { status: [status], ownership: [] }, { now: NOW }))
        expect(pick('active')).toEqual(['0xa'])
        expect(pick('upcoming')).toEqual(['0xb'])
        expect(pick('ended')).toEqual(['0xc'])
    })

    it('keeps farms matching any of several selected statuses', () => {
        const result = filterFarms(
            all,
            { status: ['active', 'upcoming'], ownership: [] },
            { now: NOW }
        )
        expect(ids(result)).toEqual(['0xa', '0xb'])
    })

    it('widens the list across several ownership filters', () => {
        const other = farm({ id: '0xd', pool: '0xPOOL2' })
        const result = filterFarms(
            [...all, other],
            { status: [], ownership: ['my-staked', 'match-my-position'] },
            {
                now: NOW,
                stakedIncentiveIds: new Set(['0xb']),
                myPoolAddresses: new Set(['0xpool2']),
            }
        )
        expect(ids(result)).toEqual(['0xb', '0xd'])
    })

    it('keeps only farms the wallet has a stake in', () => {
        const result = filterFarms(
            all,
            { status: [], ownership: ['my-staked'] },
            { now: NOW, stakedIncentiveIds: new Set(['0xb']) }
        )
        expect(ids(result)).toEqual(['0xb'])
    })

    it('keeps only farms whose pool the wallet holds a position in', () => {
        const other = farm({ id: '0xd', pool: '0xPOOL2' })
        const result = filterFarms(
            [...all, other],
            { status: [], ownership: ['match-my-position'] },
            { now: NOW, myPoolAddresses: new Set(['0xpool2']) }
        )
        expect(ids(result)).toEqual(['0xd'])
    })

    it('returns nothing rather than everything when the ownership data has not loaded', () => {
        expect(filterFarms(all, { status: [], ownership: ['my-staked'] }, { now: NOW })).toEqual([])
        expect(
            filterFarms(all, { status: [], ownership: ['match-my-position'] }, { now: NOW })
        ).toEqual([])
    })

    it('applies status and ownership together', () => {
        const result = filterFarms(
            all,
            { status: ['active'], ownership: ['my-staked'] },
            { now: NOW, stakedIncentiveIds: new Set(['0xa', '0xc']) }
        )
        expect(ids(result)).toEqual(['0xa'])
    })
})

describe('filterMyFarms', () => {
    const scheduled = farm({ id: '0xa', startTime: NOW + DAY, endTime: NOW + 2 * DAY })
    const running = farm({ id: '0xb', startTime: NOW - DAY, endTime: NOW + DAY })
    const endedWithLeftover = farm({
        id: '0xc',
        startTime: NOW - 2 * DAY,
        endTime: NOW - DAY,
        unclaimed: 5n,
    })
    const endedFullyPaid = farm({
        id: '0xd',
        startTime: NOW - 2 * DAY,
        endTime: NOW - DAY,
        unclaimed: 0n,
    })
    const all = [scheduled, running, endedWithLeftover, endedFullyPaid]

    it('treats scheduled and running farms as on going', () => {
        expect(ids(filterMyFarms(all, 'ongoing', NOW))).toEqual(['0xa', '0xb'])
    })

    it('narrows unclaimed to finished farms that still owe the creator', () => {
        expect(ids(filterMyFarms(all, 'unclaimed', NOW))).toEqual(['0xc'])
    })

    it('keeps every finished farm under ended, paid out or not', () => {
        expect(ids(filterMyFarms(all, 'ended', NOW))).toEqual(['0xc', '0xd'])
    })
})

describe('sortFarms', () => {
    it('orders by reward value in USD, sinking unpriced farms', () => {
        const list = [farm({ id: '0xa' }), farm({ id: '0xb' }), farm({ id: '0xc' })]
        const result = sortFarms(list, 'reward-value', {
            now: NOW,
            rewardValueUsd: { '0xa': 100, '0xc': 900 },
        })
        expect(ids(result)).toEqual(['0xc', '0xa', '0xb'])
    })

    it('does not rank a large raw balance above a more valuable one', () => {
        const cheap = farm({ id: '0xa', unclaimed: 10n ** 24n })
        const valuable = farm({ id: '0xb', unclaimed: 1n })
        const result = sortFarms([cheap, valuable], 'reward-value', {
            now: NOW,
            rewardValueUsd: { '0xa': 5, '0xb': 5000 },
        })
        expect(ids(result)).toEqual(['0xb', '0xa'])
    })

    it('orders by creation time and falls back to start time when the row has none', () => {
        const older = farm({ id: '0xa', createdAt: NOW - 10 * DAY })
        const newer = farm({ id: '0xb', createdAt: NOW - DAY })
        const noCreatedAt = farm({ id: '0xc', createdAt: null, startTime: NOW + 30 * DAY })
        expect(ids(sortFarms([older, newer, noCreatedAt], 'newest', { now: NOW }))).toEqual([
            '0xc',
            '0xb',
            '0xa',
        ])
    })

    it('puts farms yet to open first, soonest first', () => {
        const soon = farm({ id: '0xa', startTime: NOW + DAY })
        const later = farm({ id: '0xb', startTime: NOW + 5 * DAY })
        const alreadyOpen = farm({ id: '0xc', startTime: NOW - DAY })
        expect(ids(sortFarms([alreadyOpen, later, soon], 'opening-soon', { now: NOW }))).toEqual([
            '0xa',
            '0xb',
            '0xc',
        ])
    })

    it('puts running farms first, soonest to finish first', () => {
        const finishingSoon = farm({ id: '0xa', endTime: NOW + DAY })
        const finishingLater = farm({ id: '0xb', endTime: NOW + 5 * DAY })
        const finished = farm({ id: '0xc', endTime: NOW - DAY })
        expect(
            ids(sortFarms([finished, finishingLater, finishingSoon], 'ending-soon', { now: NOW }))
        ).toEqual(['0xa', '0xb', '0xc'])
    })

    it('breaks ties deterministically regardless of input order', () => {
        const a = farm({ id: '0xa' })
        const b = farm({ id: '0xb' })
        const ctx = { now: NOW, rewardValueUsd: { '0xa': 10, '0xb': 10 } }
        expect(ids(sortFarms([a, b], 'reward-value', ctx))).toEqual(
            ids(sortFarms([b, a], 'reward-value', ctx))
        )
    })

    it('leaves the input array untouched', () => {
        const list = [farm({ id: '0xb' }), farm({ id: '0xa' })]
        sortFarms(list, 'newest', { now: NOW })
        expect(ids(list)).toEqual(['0xb', '0xa'])
    })
})

describe('pagination', () => {
    it('uses six per page for cards and ten for the table', () => {
        expect(FARM_PAGE_SIZE.card).toBe(6)
        expect(FARM_PAGE_SIZE.table).toBe(10)
    })

    it('counts pages with a partial last page', () => {
        expect(getTotalPages(0, 3)).toBe(1)
        expect(getTotalPages(3, 3)).toBe(1)
        expect(getTotalPages(4, 3)).toBe(2)
        expect(getTotalPages(10, 10)).toBe(1)
        expect(getTotalPages(11, 10)).toBe(2)
    })

    it('clamps a page into range', () => {
        expect(clampPage(0, 5)).toBe(1)
        expect(clampPage(9, 5)).toBe(5)
        expect(clampPage(3, 5)).toBe(3)
        expect(clampPage(Number.NaN, 5)).toBe(1)
        expect(clampPage(2, 0)).toBe(1)
    })

    it('slices the requested page', () => {
        const items = [1, 2, 3, 4, 5, 6, 7]
        expect(paginate(items, 1, 3)).toEqual([1, 2, 3])
        expect(paginate(items, 3, 3)).toEqual([7])
    })

    it('falls back to the last page instead of returning nothing when the page overruns', () => {
        const items = [1, 2, 3, 4]
        expect(paginate(items, 99, 3)).toEqual([4])
    })
})

describe('extractIncentiveCreatedAt', () => {
    it('reads whichever timestamp field the indexer row carries', () => {
        expect(extractIncentiveCreatedAt({ createdAt: NOW })).toBe(NOW)
        expect(extractIncentiveCreatedAt({ blockTimestamp: NOW })).toBe(NOW)
        expect(extractIncentiveCreatedAt({ timestamp: String(NOW) })).toBe(NOW)
    })

    it('normalises milliseconds to seconds', () => {
        expect(extractIncentiveCreatedAt({ createdAt: NOW * 1000 })).toBe(NOW)
    })

    it('returns null when the row records no usable timestamp', () => {
        expect(extractIncentiveCreatedAt({})).toBeNull()
        expect(extractIncentiveCreatedAt({ createdAt: 0 })).toBeNull()
        expect(extractIncentiveCreatedAt({ createdAt: 'later' })).toBeNull()
        expect(extractIncentiveCreatedAt(null)).toBeNull()
        expect(extractIncentiveCreatedAt(undefined)).toBeNull()
    })
})
