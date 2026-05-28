import { formatEther } from 'viem'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import type { LeaderboardTimePeriod } from '@/types/leaderboard'

export function getTimeThreshold(period: LeaderboardTimePeriod): number {
    if (period === 'all') return 0
    const now = Math.floor(Date.now() / 1000)
    switch (period) {
        case '24h':
            return now - 86400
        case '7d':
            return now - 604800
        case '30d':
            return now - 2592000
    }
}

interface SwapEventRow {
    tokenAddr: string
    sender: string
    isBuy: number
    amountIn: string
    amountOut: string
    timestamp: number
}

interface SwapEventsResponse {
    swapEvents: { items: SwapEventRow[] }
}

export async function fetchSwapEvents(sinceTimestamp: number): Promise<SwapEventRow[]> {
    const where = sinceTimestamp > 0 ? `(where: { timestamp_gte: ${sinceTimestamp} })` : ''
    const query = `{
        swapEvents${where}(orderBy: "timestamp", orderDirection: "desc", limit: 1000) {
            items { tokenAddr sender isBuy amountIn amountOut timestamp }
        }
    }`
    try {
        const data = await ponderRequest<SwapEventsResponse>(query)
        return data.swapEvents.items
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

export function safeFormatEther(value: string): number {
    try {
        return parseFloat(formatEther(BigInt(value)))
    } catch {
        return 0
    }
}
