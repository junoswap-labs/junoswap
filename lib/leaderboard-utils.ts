import { formatEther } from 'viem'
import { kubTestnet, bitkub, jbc } from '@/lib/wagmi'
import {
    fetchBondingCurveSwaps,
    fetchV3Swaps,
    fetchV2Swaps,
    type ParsedSwap,
} from '@/lib/swap-events'
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

export function safeFormatEther(value: string): number {
    try {
        return parseFloat(formatEther(BigInt(value)))
    } catch {
        return 0
    }
}
