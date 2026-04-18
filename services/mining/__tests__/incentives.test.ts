import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    isIncentiveActive,
    isIncentiveEnded,
    isIncentivePending,
    getTimeRemaining,
    formatTimeRemaining,
    getIncentiveStatus,
    getIncentiveProgress,
} from '@/services/mining/incentives'
import type { IncentiveKey } from '@/types/earn'

const NOW = 1700000000

const makeKey = (startTime: number, endTime: number): IncentiveKey => ({
    rewardToken: '0xReward' as `0x${string}`,
    pool: '0xPool' as `0x${string}`,
    startTime,
    endTime,
    refundee: '0xRefund' as `0x${string}`,
})

describe('incentive status functions', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW * 1000)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('isIncentiveActive', () => {
        it('returns true when current time is between start and end', () => {
            expect(isIncentiveActive(makeKey(NOW - 100, NOW + 100))).toBe(true)
        })

        it('returns true when current time equals start', () => {
            expect(isIncentiveActive(makeKey(NOW, NOW + 100))).toBe(true)
        })

        it('returns false when current time equals end', () => {
            expect(isIncentiveActive(makeKey(NOW - 100, NOW))).toBe(false)
        })

        it('returns false when before start', () => {
            expect(isIncentiveActive(makeKey(NOW + 100, NOW + 200))).toBe(false)
        })

        it('returns false when after end', () => {
            expect(isIncentiveActive(makeKey(NOW - 200, NOW - 100))).toBe(false)
        })
    })

    describe('isIncentiveEnded', () => {
        it('returns true when current time >= end', () => {
            expect(isIncentiveEnded(makeKey(NOW - 200, NOW - 100))).toBe(true)
            expect(isIncentiveEnded(makeKey(NOW - 100, NOW))).toBe(true)
        })

        it('returns false when current time < end', () => {
            expect(isIncentiveEnded(makeKey(NOW - 100, NOW + 100))).toBe(false)
        })
    })

    describe('isIncentivePending', () => {
        it('returns true when current time < start', () => {
            expect(isIncentivePending(makeKey(NOW + 100, NOW + 200))).toBe(true)
        })

        it('returns false when current time >= start', () => {
            expect(isIncentivePending(makeKey(NOW, NOW + 100))).toBe(false)
        })
    })

    describe('getTimeRemaining', () => {
        it('returns correct breakdown', () => {
            const result = getTimeRemaining(NOW + 90061)
            expect(result.days).toBe(1)
            expect(result.hours).toBe(1)
            expect(result.minutes).toBe(1)
            expect(result.seconds).toBe(1)
            expect(result.isEnded).toBe(false)
            expect(result.totalSeconds).toBe(90061)
        })

        it('returns isEnded true and zeros when expired', () => {
            const result = getTimeRemaining(NOW - 100)
            expect(result.isEnded).toBe(true)
            expect(result.days).toBe(0)
            expect(result.totalSeconds).toBe(0)
        })
    })

    describe('formatTimeRemaining', () => {
        it('returns "Ended" when expired', () => {
            expect(formatTimeRemaining(NOW - 100)).toBe('Ended')
        })

        it('returns days format when days > 0', () => {
            expect(formatTimeRemaining(NOW + 90000)).toBe('1d 1h remaining')
        })

        it('returns hours format when hours > 0 but no days', () => {
            expect(formatTimeRemaining(NOW + 3660)).toBe('1h 1m remaining')
        })

        it('returns minutes format when only minutes remain', () => {
            expect(formatTimeRemaining(NOW + 120)).toBe('2m remaining')
        })
    })

    describe('getIncentiveStatus', () => {
        it('returns "pending" for future incentive', () => {
            expect(getIncentiveStatus(makeKey(NOW + 100, NOW + 200))).toBe('pending')
        })

        it('returns "active" for ongoing incentive', () => {
            expect(getIncentiveStatus(makeKey(NOW - 100, NOW + 100))).toBe('active')
        })

        it('returns "ended" for past incentive', () => {
            expect(getIncentiveStatus(makeKey(NOW - 200, NOW - 100))).toBe('ended')
        })
    })

    describe('getIncentiveProgress', () => {
        it('returns 0 before start', () => {
            expect(getIncentiveProgress(NOW + 100, NOW + 200)).toBe(0)
        })

        it('returns 100 after end', () => {
            expect(getIncentiveProgress(NOW - 200, NOW - 100)).toBe(100)
        })

        it('returns correct percentage during active period', () => {
            // 50% through
            expect(getIncentiveProgress(NOW - 50, NOW + 50)).toBe(50)
        })

        it('uses Math.round for percentages', () => {
            // 33.33% through
            const result = getIncentiveProgress(NOW - 100, NOW + 200)
            expect(result).toBe(Math.round(result))
        })
    })
})
