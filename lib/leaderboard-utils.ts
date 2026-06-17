import { formatEther } from 'viem'
import { kubTestnet, bitkub, jbc } from '@/lib/wagmi'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import type { LeaderboardTimePeriod } from '@/types/leaderboard'

/** Chains that have indexed Ponder V3 swap data for the leaderboard/points/portfolio. */
const LEADERBOARD_SUPPORTED_CHAINS = new Set<number>([kubTestnet.id, bitkub.id, jbc.id])

export function isLeaderboardSupportedChain(chainId: number): boolean {
    return LEADERBOARD_SUPPORTED_CHAINS.has(chainId)
}

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
    txFrom: string
    tokenIsToken0: number
    amount0: string
    amount1: string
    timestamp: number
}

interface V3SwapEventsResponse {
    v3SwapEvents: { items: V3SwapEventRow[] }
}

export async function fetchSwapEvents(sinceTimestamp: number): Promise<SwapEventRow[]> {
    const where = sinceTimestamp > 0 ? `where: { timestamp_gte: ${sinceTimestamp} }, ` : ''
    const query = `{
        swapEvents(${where}orderBy: "timestamp", orderDirection: "desc", limit: 1000) {
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

export async function fetchV3SwapEvents(
    chainId: number,
    sinceTimestamp: number
): Promise<SwapEventRow[]> {
    const filters = [`chainId: ${chainId}`]
    if (sinceTimestamp > 0) filters.push(`timestamp_gte: ${sinceTimestamp}`)
    const where = `where: { ${filters.join(', ')} }, `
    const query = `{
        v3SwapEvents(${where}orderBy: "timestamp", orderDirection: "desc", limit: 1000) {
            items { tokenAddr txFrom tokenIsToken0 amount0 amount1 timestamp }
        }
    }`
    try {
        const data = await ponderRequest<V3SwapEventsResponse>(query)
        return data.v3SwapEvents.items.map((e) => {
            // amount0/amount1 are pool-perspective deltas: positive = token into the
            // pool (user pays), negative = out of the pool (user receives). Use
            // tokenIsToken0 to pick which side is the token vs native; attribute the
            // trade to txFrom (the actual trader) rather than the router caller.
            const tokenIsToken0 = e.tokenIsToken0 === 1
            const tokenAmt = BigInt(tokenIsToken0 ? e.amount0 : e.amount1)
            const nativeAmt = BigInt(tokenIsToken0 ? e.amount1 : e.amount0)
            const abs = (x: bigint) => (x < 0n ? -x : x)
            const isBuy = tokenAmt < 0n // token leaves the pool => user receives it
            return {
                tokenAddr: e.tokenAddr,
                sender: e.txFrom,
                isBuy: isBuy ? 1 : 0,
                amountIn: (isBuy ? abs(nativeAmt) : abs(tokenAmt)).toString(),
                amountOut: (isBuy ? abs(tokenAmt) : abs(nativeAmt)).toString(),
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
