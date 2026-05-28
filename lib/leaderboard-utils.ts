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

interface V3SwapEventRow {
    tokenAddr: string
    sender: string
    amount0: string
    amount1: string
    timestamp: number
}

interface V3SwapEventsResponse {
    v3SwapEvents: { items: V3SwapEventRow[] }
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

export async function fetchV3SwapEvents(sinceTimestamp: number): Promise<SwapEventRow[]> {
    const where = sinceTimestamp > 0 ? `(where: { timestamp_gte: ${sinceTimestamp} })` : ''
    const query = `{
        v3SwapEvents${where}(orderBy: "timestamp", orderDirection: "desc", limit: 1000) {
            items { tokenAddr sender amount0 amount1 timestamp }
        }
    }`
    try {
        const data = await ponderRequest<V3SwapEventsResponse>(query)
        return data.v3SwapEvents.items.map((e) => {
            const amount0 = BigInt(e.amount0)
            const amount1 = BigInt(e.amount1)
            const isBuy = amount0 < 0n
            return {
                tokenAddr: e.tokenAddr,
                sender: e.sender,
                isBuy: isBuy ? 1 : 0,
                amountIn: isBuy
                    ? amount1 < 0n
                        ? (-amount1).toString()
                        : '0'
                    : (-amount0).toString(),
                amountOut: isBuy
                    ? amount0 < 0n
                        ? '0'
                        : amount0.toString()
                    : amount1 < 0n
                      ? '0'
                      : amount1.toString(),
                timestamp: e.timestamp,
            }
        })
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
