import { formatEther } from 'viem'
import { kubTestnet, bitkub, jbc } from '@/lib/wagmi'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import type { LeaderboardTimePeriod } from '@/types/leaderboard'

/** Chains that have indexed Ponder V3 swap data for the leaderboard/points/portfolio. */
const LEADERBOARD_SUPPORTED_CHAINS = new Set<number>([kubTestnet.id, bitkub.id, jbc.id])

export function isLeaderboardSupportedChain(chainId: number): boolean {
    return LEADERBOARD_SUPPORTED_CHAINS.has(chainId)
}

/** Lowercased wrapped-native address for a chain, or null if unknown. */
function wrappedNativeFor(chainId: number): string | null {
    return INTERMEDIARY_TOKENS[chainId]?.wrappedNative.toLowerCase() ?? null
}

/**
 * Points are awarded per native-token volume, discounted 10× for non-junoswap DEXes:
 * junoswap volume earns 1 point per 50 native, external (kublerx/jibswap/…) volume earns
 * 1 point per 500. Volumes are summed before flooring so sub-threshold amounts still add up.
 */
export function computePoints(junoVolumeNative: number, externalVolumeNative: number): number {
    return Math.floor(junoVolumeNative / 50 + externalVolumeNative / 500)
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
    // Liquidity source (dexId): 'junoswap' for our own pools + bonding curve, or an
    // external DEX id ('kublerx' | 'jibswap' | 'udonswap' | 'ponder' | 'diamon').
    protocol: string
}

interface SwapEventsResponse {
    swapEvents: { items: Omit<SwapEventRow, 'protocol'>[] }
}

interface V3SwapEventRow {
    tokenAddr: string
    txFrom: string
    amount0: string
    amount1: string
    token0Addr: string | null
    token1Addr: string | null
    timestamp: number
    protocol: string
}

interface V3SwapEventsResponse {
    v3SwapEvents: { items: V3SwapEventRow[] }
}

interface V2SwapEventRow {
    txFrom: string
    token0Addr: string
    token1Addr: string
    amount0In: string
    amount1In: string
    amount0Out: string
    amount1Out: string
    timestamp: number
    protocol: string
}

interface V2SwapEventsResponse {
    v2SwapEvents: { items: V2SwapEventRow[] }
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
        // Bonding-curve swaps are always on our own launchpad.
        return data.swapEvents.items.map((e) => ({ ...e, protocol: 'junoswap' }))
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

export async function fetchV3SwapEvents(
    chainId: number,
    sinceTimestamp: number
): Promise<SwapEventRow[]> {
    const wn = wrappedNativeFor(chainId)
    if (!wn) return []
    const filters = [`chainId: ${chainId}`]
    if (sinceTimestamp > 0) filters.push(`timestamp_gte: ${sinceTimestamp}`)
    const where = `where: { ${filters.join(', ')} }, `
    const query = `{
        v3SwapEvents(${where}orderBy: "timestamp", orderDirection: "desc", limit: 1000) {
            items { tokenAddr txFrom amount0 amount1 token0Addr token1Addr timestamp protocol }
        }
    }`
    try {
        const data = await ponderRequest<V3SwapEventsResponse>(query)
        const rows: SwapEventRow[] = []
        for (const e of data.v3SwapEvents.items) {
            // amount0/amount1 are pool-perspective deltas: positive = token into the
            // pool (user pays), negative = out of the pool (user receives). Resolve the
            // native side against the chain's wrapped native rather than the stored
            // tokenIsToken0, which defaults to token0 for external token/token pools and
            // would mis-read the amount. Token/token swaps (no native leg) are skipped.
            const token0 = e.token0Addr?.toLowerCase()
            const token1 = e.token1Addr?.toLowerCase()
            let nativeIsToken0: boolean
            if (token1 === wn) nativeIsToken0 = false
            else if (token0 === wn) nativeIsToken0 = true
            else continue
            const nativeAmt = BigInt(nativeIsToken0 ? e.amount0 : e.amount1)
            const tokenAmt = BigInt(nativeIsToken0 ? e.amount1 : e.amount0)
            const abs = (x: bigint) => (x < 0n ? -x : x)
            const isBuy = tokenAmt < 0n // token leaves the pool => user receives it
            rows.push({
                tokenAddr: e.tokenAddr,
                // Attribute the trade to txFrom (the actual trader), not the router caller.
                sender: e.txFrom,
                isBuy: isBuy ? 1 : 0,
                amountIn: (isBuy ? abs(nativeAmt) : abs(tokenAmt)).toString(),
                amountOut: (isBuy ? abs(tokenAmt) : abs(nativeAmt)).toString(),
                timestamp: e.timestamp,
                protocol: e.protocol || 'junoswap',
            })
        }
        return rows
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

export async function fetchV2SwapEvents(
    chainId: number,
    sinceTimestamp: number
): Promise<SwapEventRow[]> {
    const wn = wrappedNativeFor(chainId)
    if (!wn) return []
    const filters = [`chainId: ${chainId}`]
    if (sinceTimestamp > 0) filters.push(`timestamp_gte: ${sinceTimestamp}`)
    const where = `where: { ${filters.join(', ')} }, `
    const query = `{
        v2SwapEvents(${where}orderBy: "timestamp", orderDirection: "desc", limit: 1000) {
            items { txFrom token0Addr token1Addr amount0In amount1In amount0Out amount1Out timestamp protocol }
        }
    }`
    try {
        const data = await ponderRequest<V2SwapEventsResponse>(query)
        const rows: SwapEventRow[] = []
        for (const e of data.v2SwapEvents.items) {
            // V2 Swap amounts are non-negative in/out per side. Measure volume on the
            // wrapped-native leg; token/token pools (no native leg) are skipped. Resolve
            // native vs token side against the chain's wrapped native, then map to the
            // indexer's buy/sell semantics (buy: amountIn=native paid, amountOut=tokens
            // received; sell: amountIn=tokens sold, amountOut=native received) so the
            // PnL engine values the trade correctly.
            const token0 = e.token0Addr.toLowerCase()
            const token1 = e.token1Addr.toLowerCase()
            let nativeIn: bigint, nativeOut: bigint, tokenIn: bigint, tokenOut: bigint
            let tokenAddr: string
            if (token0 === wn) {
                nativeIn = BigInt(e.amount0In)
                nativeOut = BigInt(e.amount0Out)
                tokenIn = BigInt(e.amount1In)
                tokenOut = BigInt(e.amount1Out)
                tokenAddr = token1
            } else if (token1 === wn) {
                nativeIn = BigInt(e.amount1In)
                nativeOut = BigInt(e.amount1Out)
                tokenIn = BigInt(e.amount0In)
                tokenOut = BigInt(e.amount0Out)
                tokenAddr = token0
            } else {
                continue
            }
            const isBuy = nativeIn > 0n // native flows into the pool => user buys token
            rows.push({
                tokenAddr,
                sender: e.txFrom,
                isBuy: isBuy ? 1 : 0,
                amountIn: (isBuy ? nativeIn : tokenIn).toString(),
                amountOut: (isBuy ? tokenOut : nativeOut).toString(),
                timestamp: e.timestamp,
                protocol: e.protocol || 'unknown',
            })
        }
        return rows
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
