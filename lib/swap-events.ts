import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'

/**
 * Shared swap-event fetching + parsing for the portfolio, leaderboard and points
 * views. All three feed the same weighted-average-cost PnL/volume math, so they must
 * see the *same* event set and parse each swap identically — fetching here (full
 * cursor pagination, one native-leg parser) keeps them in lockstep.
 */

const PAGE_SIZE = 1000

/** Lowercased wrapped-native address for a chain, or null if unknown. */
export function wrappedNativeFor(chainId: number): string | null {
    return INTERMEDIARY_TOKENS[chainId]?.wrappedNative.toLowerCase() ?? null
}

/**
 * One normalized swap. Semantics match the indexer/PnL convention:
 * - buy:  amountIn = native paid, amountOut = tokens received
 * - sell: amountIn = tokens sold, amountOut = native received
 * `sender` is the raw trader address (callers lowercase as needed); `protocol` is the
 * liquidity source ('junoswap' for our pools + bonding curve, or an external DEX id).
 */
export interface ParsedSwap {
    tokenAddr: string
    sender: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
    protocol: string
}

interface PageInfo {
    hasNextPage: boolean
    endCursor: string | null
}

interface Connection<TRow> {
    items: TRow[]
    pageInfo?: PageInfo
}

/**
 * Walk a Ponder list field to completion via opaque cursor pagination. The cursor is
 * the base64 `pageInfo.endCursor` — passing a raw row id instead fails server-side.
 * A response without `pageInfo` (e.g. a test mock) terminates after the first page.
 */
async function paginate<TRow>(
    field: string,
    whereClause: string,
    selection: string
): Promise<TRow[]> {
    const rows: TRow[] = []
    let after: string | null = null
    for (;;) {
        const query = `
          query Page($after: String) {
            ${field}(
              ${whereClause}
              orderBy: "timestamp",
              orderDirection: "asc",
              limit: ${PAGE_SIZE},
              after: $after
            ) {
              pageInfo { hasNextPage endCursor }
              items { ${selection} }
            }
          }
        `
        const data: Record<string, Connection<TRow>> = await ponderRequest(query, { after })
        const conn = data[field]
        if (!conn) break
        rows.push(...conn.items)
        if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break
        after = conn.pageInfo.endCursor
    }
    return rows
}

interface SwapFilter {
    /** Lowercased trader address; omit to fetch across all traders. */
    sender?: string
    /** Unix seconds lower bound; omit or 0 for all-time. */
    since?: number
}

interface RawBondingCurveSwap {
    tokenAddr: string
    sender: string
    isBuy: number
    amountIn: string
    amountOut: string
    timestamp: number
}

interface RawV3Swap {
    tokenAddr: string
    txFrom: string
    amount0: string
    amount1: string
    token0Addr: string | null
    token1Addr: string | null
    timestamp: number
    protocol: string
}

interface RawV2Swap {
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

const abs = (x: bigint) => (x < 0n ? -x : x)

/**
 * Parse a V3 swap row. amount0/amount1 are pool-perspective deltas: positive = token
 * into the pool (user pays), negative = out of the pool (user receives). Resolve the
 * native leg against the chain's wrapped native via token0Addr/token1Addr rather than
 * the stored tokenIsToken0, which defaults to token0 for external token/token pools
 * and would mis-read the amount. Token/token swaps (no native leg) return null.
 */
export function parseV3Swap(e: RawV3Swap, wrappedNative: string): ParsedSwap | null {
    const token0 = e.token0Addr?.toLowerCase()
    const token1 = e.token1Addr?.toLowerCase()
    let nativeIsToken0: boolean
    if (token1 === wrappedNative) nativeIsToken0 = false
    else if (token0 === wrappedNative) nativeIsToken0 = true
    else return null
    const nativeAmt = BigInt(nativeIsToken0 ? e.amount0 : e.amount1)
    const tokenAmt = BigInt(nativeIsToken0 ? e.amount1 : e.amount0)
    const isBuy = tokenAmt < 0n // token leaves the pool => user receives it
    return {
        tokenAddr: e.tokenAddr.toLowerCase(),
        sender: e.txFrom,
        isBuy,
        amountIn: (isBuy ? abs(nativeAmt) : abs(tokenAmt)).toString(),
        amountOut: (isBuy ? abs(tokenAmt) : abs(nativeAmt)).toString(),
        timestamp: e.timestamp,
        protocol: e.protocol || 'junoswap',
    }
}

/**
 * Parse a V2 swap row. V2 amounts are non-negative in/out per side. Resolve the native
 * leg against the chain's wrapped native; token/token pools (no native leg) return
 * null. Maps to buy/sell semantics: buy = native paid in / tokens out, sell = tokens
 * in / native out.
 */
export function parseV2Swap(e: RawV2Swap, wrappedNative: string): ParsedSwap | null {
    const token0 = e.token0Addr.toLowerCase()
    const token1 = e.token1Addr.toLowerCase()
    let nativeIn: bigint, nativeOut: bigint, tokenIn: bigint, tokenOut: bigint
    let tokenAddr: string
    if (token0 === wrappedNative) {
        nativeIn = BigInt(e.amount0In)
        nativeOut = BigInt(e.amount0Out)
        tokenIn = BigInt(e.amount1In)
        tokenOut = BigInt(e.amount1Out)
        tokenAddr = token1
    } else if (token1 === wrappedNative) {
        nativeIn = BigInt(e.amount1In)
        nativeOut = BigInt(e.amount1Out)
        tokenIn = BigInt(e.amount0In)
        tokenOut = BigInt(e.amount0Out)
        tokenAddr = token0
    } else {
        return null
    }
    const isBuy = nativeIn > 0n // native flows into the pool => user buys token
    return {
        tokenAddr,
        sender: e.txFrom,
        isBuy,
        amountIn: (isBuy ? nativeIn : tokenIn).toString(),
        amountOut: (isBuy ? tokenOut : nativeOut).toString(),
        timestamp: e.timestamp,
        protocol: e.protocol || 'unknown',
    }
}

function buildWhere(filters: string[]): string {
    return filters.length ? `where: { ${filters.join(', ')} },` : ''
}

/** Bonding-curve swaps (launchpad chain only). Already buy/sell-normalized by the indexer. */
export async function fetchBondingCurveSwaps(filter: SwapFilter): Promise<ParsedSwap[]> {
    const filters: string[] = []
    if (filter.sender) filters.push(`sender: "${filter.sender}"`)
    if (filter.since && filter.since > 0) filters.push(`timestamp_gte: ${filter.since}`)
    try {
        const rows = await paginate<RawBondingCurveSwap>(
            'swapEvents',
            buildWhere(filters),
            'tokenAddr sender isBuy amountIn amountOut timestamp'
        )
        return rows.map((e) => ({
            tokenAddr: e.tokenAddr.toLowerCase(),
            sender: e.sender,
            isBuy: e.isBuy === 1,
            amountIn: e.amountIn,
            amountOut: e.amountOut,
            timestamp: e.timestamp,
            protocol: 'junoswap',
        }))
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

/** V3 swaps (junoswap + external kublerx), native leg resolved against wrapped native. */
export async function fetchV3Swaps(chainId: number, filter: SwapFilter): Promise<ParsedSwap[]> {
    const wn = wrappedNativeFor(chainId)
    if (!wn) return []
    const filters = [`chainId: ${chainId}`]
    if (filter.sender) filters.push(`txFrom: "${filter.sender}"`)
    if (filter.since && filter.since > 0) filters.push(`timestamp_gte: ${filter.since}`)
    try {
        const rows = await paginate<RawV3Swap>(
            'v3SwapEvents',
            buildWhere(filters),
            'tokenAddr txFrom amount0 amount1 token0Addr token1Addr timestamp protocol'
        )
        const out: ParsedSwap[] = []
        for (const r of rows) {
            const p = parseV3Swap(r, wn)
            if (p) out.push(p)
        }
        return out
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

/** External V2 swaps, native leg resolved against wrapped native. */
export async function fetchV2Swaps(chainId: number, filter: SwapFilter): Promise<ParsedSwap[]> {
    const wn = wrappedNativeFor(chainId)
    if (!wn) return []
    const filters = [`chainId: ${chainId}`]
    if (filter.sender) filters.push(`txFrom: "${filter.sender}"`)
    if (filter.since && filter.since > 0) filters.push(`timestamp_gte: ${filter.since}`)
    try {
        const rows = await paginate<RawV2Swap>(
            'v2SwapEvents',
            buildWhere(filters),
            'txFrom token0Addr token1Addr amount0In amount1In amount0Out amount1Out timestamp protocol'
        )
        const out: ParsedSwap[] = []
        for (const r of rows) {
            const p = parseV2Swap(r, wn)
            if (p) out.push(p)
        }
        return out
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}
