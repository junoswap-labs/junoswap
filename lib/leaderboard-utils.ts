import { formatEther } from 'viem'
import { kubTestnet, bitkub, jbc } from '@/lib/wagmi'
import {
    fetchBondingCurveSwaps,
    fetchV3Swaps,
    fetchV2Swaps,
    type ParsedSwap,
} from '@/lib/swap-events'
import { isLaunchpadChain } from '@/lib/abis/pump-core-native'
import type { LeaderboardTimePeriod } from '@/types/leaderboard'

/** Chains that have indexed Ponder V3 swap data for the leaderboard/points/portfolio. */
const LEADERBOARD_SUPPORTED_CHAINS = new Set<number>([kubTestnet.id, bitkub.id, jbc.id])

export function isLeaderboardSupportedChain(chainId: number): boolean {
    return LEADERBOARD_SUPPORTED_CHAINS.has(chainId)
}

/**
 * Points are awarded per native-token volume, discounted 10× for non-junoswap DEXes:
 * junoswap volume earns 1 point per 50 native, external (kublerx/jibswap/…) volume earns
 * 1 point per 500. Volumes are summed before flooring so sub-threshold amounts still add up.
 */
export function computePoints(junoVolumeNative: number, externalVolumeNative: number): number {
    return Math.floor(junoVolumeNative / 50 + externalVolumeNative / 500)
}

/**
 * Referral reward: a referrer earns 10% of the points their referees earn. Floored to
 * keep the same integer-points convention as computePoints (floor once, at the end).
 */
export function computeReferralPoints(refereePoints: number[]): number {
    return Math.floor(refereePoints.reduce((sum, p) => sum + p, 0) * 0.1)
}

export interface TraderAgg {
    volumeNative: number
    points: number
    tradeCount: number
    buyCount: number
    sellCount: number
}

/**
 * Aggregate swap rows into per-address volume/points/trade counts. Native volume is split
 * by source — junoswap (incl. bonding curve) full rate, external DEXes 10× discounted —
 * but the returned volumeNative is the real (undiscounted) total; only points apply the
 * discount via computePoints. Shared by the points leaderboard and referral rewards so
 * both compute points identically.
 */
export function aggregatePointsByAddress(rows: SwapEventRow[]): Map<string, TraderAgg> {
    interface Acc {
        junoVolumeNative: number
        externalVolumeNative: number
        tradeCount: number
        buyCount: number
        sellCount: number
    }
    const acc = new Map<string, Acc>()
    for (const e of rows) {
        const sender = e.sender.toLowerCase()
        const isBuy = e.isBuy === 1
        const nativeAmount = safeFormatEther(isBuy ? e.amountIn : e.amountOut)
        let a = acc.get(sender)
        if (!a) {
            a = {
                junoVolumeNative: 0,
                externalVolumeNative: 0,
                tradeCount: 0,
                buyCount: 0,
                sellCount: 0,
            }
            acc.set(sender, a)
        }
        if (e.protocol === 'junoswap') a.junoVolumeNative += nativeAmount
        else a.externalVolumeNative += nativeAmount
        a.tradeCount++
        if (isBuy) a.buyCount++
        else a.sellCount++
    }
    const out = new Map<string, TraderAgg>()
    for (const [addr, a] of acc) {
        out.set(addr, {
            volumeNative: a.junoVolumeNative + a.externalVolumeNative,
            points: computePoints(a.junoVolumeNative, a.externalVolumeNative),
            tradeCount: a.tradeCount,
            buyCount: a.buyCount,
            sellCount: a.sellCount,
        })
    }
    return out
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

export interface SwapEventRow {
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

// The leaderboard/points views key buy/sell on a numeric flag; the shared fetchers
// return a boolean. Bridge here so both views keep their existing 0/1 contract.
function toRow(p: ParsedSwap): SwapEventRow {
    return {
        tokenAddr: p.tokenAddr,
        sender: p.sender,
        isBuy: p.isBuy ? 1 : 0,
        amountIn: p.amountIn,
        amountOut: p.amountOut,
        timestamp: p.timestamp,
        protocol: p.protocol,
    }
}

export async function fetchSwapEvents(sinceTimestamp: number): Promise<SwapEventRow[]> {
    return (await fetchBondingCurveSwaps({ since: sinceTimestamp })).map(toRow)
}

export async function fetchV3SwapEvents(
    chainId: number,
    sinceTimestamp: number
): Promise<SwapEventRow[]> {
    return (await fetchV3Swaps(chainId, { since: sinceTimestamp })).map(toRow)
}

export async function fetchV2SwapEvents(
    chainId: number,
    sinceTimestamp: number
): Promise<SwapEventRow[]> {
    return (await fetchV2Swaps(chainId, { since: sinceTimestamp })).map(toRow)
}

/**
 * All-time swaps for a set of trader addresses (one `_in` query per source), used by the
 * referral panel to total each referee's points. Mirrors the source selection of the
 * points view: bonding curve only on the launchpad chain, V3/V2 everywhere supported.
 */
export async function fetchSwapEventsForSenders(
    chainId: number,
    senders: string[]
): Promise<SwapEventRow[]> {
    if (senders.length === 0) return []
    const [bondingCurve, v3, v2] = await Promise.all([
        isLaunchpadChain(chainId)
            ? fetchBondingCurveSwaps({ senderIn: senders })
            : Promise.resolve([]),
        fetchV3Swaps(chainId, { senderIn: senders }),
        fetchV2Swaps(chainId, { senderIn: senders }),
    ])
    return [...bondingCurve, ...v3, ...v2].map(toRow)
}

export function safeFormatEther(value: string): number {
    try {
        return parseFloat(formatEther(BigInt(value)))
    } catch {
        return 0
    }
}
