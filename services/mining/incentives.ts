import { getTickSpacing } from '@/lib/liquidity-helpers'
import type { Incentive, IncentiveKey, V3PoolData } from '@/types/earn'

/**
 * The farm's pool in the shape the liquidity dialogs take. Only identity is carried here — the
 * dialog reads live pool state itself, so the price and liquidity fields start empty.
 */
export function incentiveToPoolData(incentive: Incentive): V3PoolData {
    return {
        address: incentive.pool,
        token0: incentive.poolToken0,
        token1: incentive.poolToken1,
        fee: incentive.poolFee,
        liquidity: 0n,
        sqrtPriceX96: 0n,
        tick: 0,
        tickSpacing: getTickSpacing(incentive.poolFee),
    }
}

export function isIncentiveActive(key: IncentiveKey): boolean {
    const now = Math.floor(Date.now() / 1000)
    return now >= key.startTime && now < key.endTime
}

export function isIncentiveEnded(key: IncentiveKey): boolean {
    const now = Math.floor(Date.now() / 1000)
    return now >= key.endTime
}

export function isIncentivePending(key: IncentiveKey): boolean {
    const now = Math.floor(Date.now() / 1000)
    return now < key.startTime
}

export function getTimeRemaining(endTime: number): {
    days: number
    hours: number
    minutes: number
    seconds: number
    isEnded: boolean
    totalSeconds: number
} {
    const now = Math.floor(Date.now() / 1000)
    const remaining = endTime - now

    if (remaining <= 0) {
        return {
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
            isEnded: true,
            totalSeconds: 0,
        }
    }

    return {
        days: Math.floor(remaining / 86400),
        hours: Math.floor((remaining % 86400) / 3600),
        minutes: Math.floor((remaining % 3600) / 60),
        seconds: remaining % 60,
        isEnded: false,
        totalSeconds: remaining,
    }
}

export function formatTimeRemaining(endTime: number): string {
    const { days, hours, minutes, isEnded } = getTimeRemaining(endTime)

    if (isEnded) return 'Ended'
    if (days > 0) return `${days}d ${hours}h remaining`
    if (hours > 0) return `${hours}h ${minutes}m remaining`
    return `${minutes}m remaining`
}

export function getIncentiveStatus(key: IncentiveKey): 'pending' | 'active' | 'ended' {
    if (isIncentivePending(key)) return 'pending'
    if (isIncentiveEnded(key)) return 'ended'
    return 'active'
}

const CREATED_AT_KEYS = ['createdAt', 'blockTimestamp', 'timestamp', 'createdAtTimestamp'] as const
const MILLISECOND_THRESHOLD = 1e12

/**
 * Creation time from an indexer row, whichever field name it carries and whether it is stored as a
 * number, a numeric string, or milliseconds. Returns null when the row records none, in which case
 * "Newest" degrades to ordering by start time.
 */
export function extractIncentiveCreatedAt(row: unknown): number | null {
    if (!row || typeof row !== 'object') return null
    const record = row as Record<string, unknown>

    for (const key of CREATED_AT_KEYS) {
        const value = record[key]
        let parsed: number | null = null
        if (typeof value === 'number' && Number.isFinite(value)) parsed = value
        else if (typeof value === 'string' && /^\d+$/.test(value)) parsed = Number(value)
        if (parsed === null || parsed <= 0) continue
        return parsed > MILLISECOND_THRESHOLD ? Math.floor(parsed / 1000) : parsed
    }

    return null
}

export type EndIncentiveBlocker = 'NOT_ENDED' | 'STAKES_REMAINING' | 'NOTHING_TO_REFUND'

/**
 * `endIncentive` reverts unless the incentive is over, every position has been unstaked, and there
 * is something left to send back — so the reason is surfaced instead of a dead button.
 */
export function getEndIncentiveBlocker(incentive: Incentive): EndIncentiveBlocker | null {
    if (!isIncentiveEnded(incentive)) return 'NOT_ENDED'
    if (incentive.numberOfStakes > 0) return 'STAKES_REMAINING'
    if (incentive.totalRewardUnclaimed <= 0n) return 'NOTHING_TO_REFUND'
    return null
}

export function canEndIncentive(incentive: Incentive): boolean {
    return getEndIncentiveBlocker(incentive) === null
}

/** Why the refund is not available yet, in the creator's terms. Null once nothing is in the way. */
export function getEndIncentiveBlockerLabel(blocker: EndIncentiveBlocker | null): string | null {
    switch (blocker) {
        case 'NOT_ENDED':
            return 'Whatever is left comes back to you once the farm finishes.'
        case 'STAKES_REMAINING':
            return 'The staker releases the remainder only after every position has unstaked.'
        case 'NOTHING_TO_REFUND':
            return 'Every reward was distributed, so there is nothing to send back.'
        default:
            return null
    }
}

export function getIncentiveProgress(startTime: number, endTime: number): number {
    const now = Math.floor(Date.now() / 1000)

    if (now < startTime) return 0
    if (now >= endTime) return 100

    const totalDuration = endTime - startTime
    const elapsed = now - startTime

    return Math.round((elapsed / totalDuration) * 100)
}
