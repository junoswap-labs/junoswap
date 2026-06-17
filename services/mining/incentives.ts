import type { IncentiveKey } from '@/types/earn'

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

export function getIncentiveProgress(startTime: number, endTime: number): number {
    const now = Math.floor(Date.now() / 1000)

    if (now < startTime) return 0
    if (now >= endTime) return 100

    const totalDuration = endTime - startTime
    const elapsed = now - startTime

    return Math.round((elapsed / totalDuration) * 100)
}
