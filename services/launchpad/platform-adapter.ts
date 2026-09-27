import type { Address } from 'viem'
import {
    fetchBondingCurveSwaps,
    fetchTokenV3Swaps,
    fetchTokenHolders,
    fetchTokenSnapshots,
} from '@coshi190/juno-moneta-sdk'
import { ponderClient } from '@/lib/ponder-client'
import { INITIAL_TOKEN_SUPPLY } from '@/lib/launchpad-curve'
import type { HolderData, LaunchpadPlatform, SwapEventData } from '@/types/launchpad'

export interface SwapHistoryFilters {
    isBuy?: boolean // true = buys only, false = sells only, undefined = all
    sender?: string // lowercase hex address to filter by
}

export interface SwapHistoryParams {
    chainId: number
    tokenAddr: Address
    market?: Address
    isGraduated?: boolean
    page: number
    pageSize: number
    filters?: SwapHistoryFilters
}

export interface HoldersParams {
    tokenAddr: Address
    market?: Address
}

/**
 * A source of trade/holder data for one launchpad platform. Every platform-specific
 * "how do I get this data" branch belongs behind one of these, not inline in the hooks --
 * adding a third-party platform means writing a new adapter + one registry entry below,
 * not touching useTokenSwapEvents/useTokenHolders.
 */
export interface LaunchpadPlatformAdapter {
    fetchSwapHistory(
        params: SwapHistoryParams
    ): Promise<{ data: SwapEventData[]; totalCount: number }>
    fetchHolders(params: HoldersParams): Promise<{ holders: HolderData[]; holderCount: number }>
}

function absBigInt(n: bigint): bigint {
    return n < 0n ? -n : n
}

/** Pure: a V3 pool swap row -> buy/sell SwapEventData from the launch token's side. */
export function v3SwapToSwapEvent(
    e: {
        amount0: string
        amount1: string
        tokenIsToken0: number
        txFrom: string
        timestamp: number
        transactionHash: string
        blockNumber: string | number
    },
    tokenAddr: Address
): SwapEventData {
    const tokenIsToken0 = e.tokenIsToken0 === 1
    const tokenAmount = BigInt(tokenIsToken0 ? e.amount0 : e.amount1)
    const nativeAmount = BigInt(tokenIsToken0 ? e.amount1 : e.amount0)
    // The pool pays tokens out (negative delta) on a buy.
    const isBuy = tokenAmount < 0n
    return {
        blockNumber: BigInt(e.blockNumber),
        timestamp: Number(e.timestamp),
        sender: e.txFrom as Address, // actual signer, not the router
        isBuy,
        tokenAddr,
        amountIn: absBigInt(isBuy ? nativeAmount : tokenAmount),
        amountOut: absBigInt(isBuy ? tokenAmount : nativeAmount),
        reserveIn: 0n,
        reserveOut: 0n,
        transactionHash: e.transactionHash as `0x${string}`,
    }
}

function toIsBuy(isBuy: boolean | undefined): number | undefined {
    return isBuy === undefined ? undefined : isBuy ? 1 : 0
}

// ponytail: balances come from the indexer (same source that decides who is a holder), so every
// holder is listed without an on-chain read per address. If indexer lag ever matters, verify the
// visible page on-chain instead of reintroducing a global scan limit.
/** Pure: raw {address, balance} rows -> ranked HolderData[]. Shared by every adapter below. */
export function toHolders(rows: { address: string; balance: string | bigint }[]): HolderData[] {
    const byAddress = new Map<string, bigint>()
    for (const row of rows) {
        const balance = BigInt(row.balance)
        if (balance > 0n) byAddress.set(row.address.toLowerCase(), balance)
    }

    return [...byAddress]
        .map(([address, balance]) => ({
            address: address as Address,
            balance,
            percentage:
                INITIAL_TOKEN_SUPPLY > 0n
                    ? Number((balance * 10000n) / INITIAL_TOKEN_SUPPLY) / 100
                    : 0,
        }))
        .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0))
}

/**
 * Junoswap's ponder index. Also serves ANY graduated token regardless of platform -- the
 * v3-swap/holder tables are keyed by token address, not by factory, so a Durianfun token that
 * graduated onto Kublerx is already picked up here without a Durianfun-specific read (verified
 * against a real graduated token: its post-graduation trades showed up correctly).
 *
 * TODO: refactor indexing to go through @coshi190/juno-moneta-sdk end-to-end once it exposes a
 * generic third-party/bonding-curve read -- durianfunAdapter below would then drop its raw
 * getLogs calls in favor of the SDK, without any change outside this file.
 */
const ponderAdapter: LaunchpadPlatformAdapter = {
    async fetchSwapHistory({ chainId, tokenAddr, isGraduated, page, pageSize, filters }) {
        const offset = (page - 1) * pageSize

        if (isGraduated) {
            const [bcResult, v3Result] = await Promise.all([
                fetchBondingCurveSwaps(ponderClient, {
                    tokenAddr: tokenAddr.toLowerCase(),
                    page: { limit: 1000, offset: 0 },
                    isBuy: toIsBuy(filters?.isBuy),
                    sender: filters?.sender?.toLowerCase(),
                }),
                fetchTokenV3Swaps(ponderClient, {
                    tokenAddr: tokenAddr.toLowerCase(),
                    chainId,
                    page: { limit: pageSize, offset },
                    txFrom: filters?.sender?.toLowerCase(),
                }),
            ])

            const bcItems = bcResult.items.map((e) => ({
                blockNumber: BigInt(e.blockNumber),
                timestamp: e.timestamp,
                sender: e.sender as Address,
                isBuy: e.isBuy === 1,
                tokenAddr,
                amountIn: BigInt(e.amountIn),
                amountOut: BigInt(e.amountOut),
                reserveIn: BigInt(e.reserveIn),
                reserveOut: BigInt(e.reserveOut),
                transactionHash: e.transactionHash as `0x${string}`,
            }))

            let v3Items = v3Result.items.map((e) => v3SwapToSwapEvent(e, tokenAddr))

            if (filters?.isBuy !== undefined) {
                v3Items = v3Items.filter((item) => item.isBuy === filters.isBuy)
            }

            const nv3 = v3Result.totalCount
            const bcStart = Math.max(0, offset - nv3)
            const bcNeeded = pageSize - v3Items.length
            const bcInWindow = bcNeeded > 0 ? bcItems.slice(bcStart, bcStart + bcNeeded) : []
            const data = [...v3Items, ...bcInWindow]
            const totalCount = nv3 + bcItems.length

            return { data, totalCount }
        }

        const result = await fetchBondingCurveSwaps(ponderClient, {
            tokenAddr: tokenAddr.toLowerCase(),
            page: { limit: pageSize, offset },
            isBuy: toIsBuy(filters?.isBuy),
            sender: filters?.sender?.toLowerCase(),
        })

        const data = result.items.map((e) => ({
            blockNumber: BigInt(e.blockNumber),
            timestamp: e.timestamp,
            sender: e.sender as Address,
            isBuy: e.isBuy === 1,
            tokenAddr,
            amountIn: BigInt(e.amountIn),
            amountOut: BigInt(e.amountOut),
            reserveIn: BigInt(e.reserveIn),
            reserveOut: BigInt(e.reserveOut),
            transactionHash: e.transactionHash as `0x${string}`,
        }))

        return { data, totalCount: result.totalCount }
    },

    async fetchHolders({ tokenAddr }) {
        const [rows, snapshots] = await Promise.all([
            fetchTokenHolders(ponderClient, { tokenAddr }, ['address', 'balance'] as const),
            fetchTokenSnapshots(ponderClient, { tokenAddrs: [tokenAddr] }, [
                'holderCount',
            ] as const),
        ])

        const holders = toHolders(rows)
        const holderCount = Math.max(snapshots[0]?.holderCount ?? 0, holders.length)
        return { holders, holderCount }
    },
}

// Third-party platforms whose data ISN'T indexed by ponder yet, keyed by platform id. As of
// SDK 0.50.0, coshi's indexer tags every launchToken/tokenSnapshot/swapEvent/tokenHolder row
// with launchpadId and already covers Durianfun end-to-end (swaps, holders, snapshots, and a
// graduated ammPool address) through the same queries ponderAdapter uses below -- no
// third-party adapter needed for it any more. Register one here only for a launchpad ponder
// genuinely doesn't index; nothing else in the data-fetching layer needs to change.
const THIRD_PARTY_ADAPTERS: Partial<Record<LaunchpadPlatform, LaunchpadPlatformAdapter>> = {}

/** Picks the right data source for a token: a registered adapter for a platform ponder doesn't
 *  index, or the shared ponder index otherwise (which covers every platform ponder does know
 *  about, graduated or not). */
export function resolvePlatformAdapter(
    platform: LaunchpadPlatform | undefined,
    isGraduated: boolean | undefined,
    market: Address | undefined
): LaunchpadPlatformAdapter {
    if (!isGraduated && market && platform) {
        const adapter = THIRD_PARTY_ADAPTERS[platform]
        if (adapter) return adapter
    }
    return ponderAdapter
}

// Platforms ponder is confirmed to index (junoswap always; durianfun since SDK 0.50.0) --
// used below to tell "ponder legitimately has nothing for this token yet" apart from "ponder
// doesn't know this platform at all". Add a platform here once its data is confirmed flowing
// through the indexed tables; until then a new platform is presumed unindexed unless it has a
// registered adapter.
const INDEXED_PLATFORMS = new Set<LaunchpadPlatform>(['junoswap', 'durianfun'])

/** True when a non-graduated third-party token belongs to a platform ponder neither indexes
 *  nor has a registered adapter for -- the ponder fallback would just come back empty, so the
 *  UI should say "service unavailable" instead of the ordinary "no data yet" (which implies
 *  the token itself has no trades/holders). */
export function isThirdPartyDataUnavailable(
    platform: LaunchpadPlatform | undefined,
    isGraduated: boolean | undefined,
    market: Address | undefined
): boolean {
    if (isGraduated || !market || !platform) return false
    if (INDEXED_PLATFORMS.has(platform)) return false
    return !THIRD_PARTY_ADAPTERS[platform]
}
