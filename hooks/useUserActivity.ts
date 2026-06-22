'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import { isLaunchpadChain } from '@/lib/abis/bonding-curve-junoswap'
import { getTokensForChain } from '@/lib/tokens'
import type { ActivityEvent, ActivityLeg } from '@/types/portfolio'

const PAGE_SIZE = 20

interface BondingCurvePage {
    swapEvents: {
        items: Array<{
            id: string
            tokenAddr: string
            sender: string
            isBuy: number
            amountIn: string
            amountOut: string
            timestamp: number
            transactionHash: string
        }>
    }
}

interface V3SwapPage {
    v3SwapEvents: {
        items: Array<{
            id: string
            tokenAddr: string
            sender: string
            txFrom: string
            tokenIsToken0: number
            amount0: string
            amount1: string
            timestamp: number
            transactionHash: string
            protocol: string
        }>
    }
}

interface V2SwapPage {
    v2SwapEvents: {
        items: Array<{
            id: string
            txFrom: string
            token0Addr: string
            token1Addr: string
            amount0In: string
            amount1In: string
            amount0Out: string
            amount1Out: string
            timestamp: number
            transactionHash: string
            protocol: string
        }>
    }
}

interface TransferPage {
    transferEvents: {
        items: Array<{
            id: string
            tokenAddr: string
            from: string
            to: string
            amount: string
            timestamp: number
            transactionHash: string
        }>
    }
}

interface TokenMetaPage {
    launchTokens: {
        items: Array<{
            tokenAddr: string
            logo: string
            name: string
            symbol: string
        }>
    }
}

interface V3TokenMetaPage {
    v3Tokens: {
        items: Array<{
            address: string
            symbol: string
            name: string
            decimals: number
        }>
    }
}

interface TokenMeta {
    symbol: string
    name: string
    logo: string
    decimals: number
}

async function fetchBondingCurveEvents(
    sender: string,
    limit: number,
    after?: string
): Promise<{ items: BondingCurvePage['swapEvents']['items']; totalCount: number }> {
    const query = `
        query UserBcActivity($sender: String!, $limit: Int!, $after: String) {
            swapEvents(
                where: { sender: $sender },
                orderBy: "timestamp",
                orderDirection: "desc",
                limit: $limit,
                after: $after
            ) {
                items {
                    id tokenAddr sender isBuy amountIn amountOut timestamp transactionHash
                }
            }
        }
    `
    const data = await ponderRequest<BondingCurvePage>(query, { sender, limit, after })
    // Total count comes from a separate count query
    const countQuery = `
        query UserBcCount($sender: String!) {
            swapEvents(where: { sender: $sender }, limit: 0) { items { id } }
        }
    `
    const countData = await ponderRequest<BondingCurvePage>(countQuery, {
        sender,
        limit: 0,
    })
    return {
        items: data.swapEvents.items,
        totalCount: countData.swapEvents.items.length,
    }
}

async function fetchV3Events(
    sender: string,
    chainId: number,
    limit: number,
    after?: string
): Promise<{ items: V3SwapPage['v3SwapEvents']['items']; totalCount: number }> {
    const query = `
        query UserV3Activity($sender: String!, $chainId: Int!, $limit: Int!, $after: String) {
            v3SwapEvents(
                where: { txFrom: $sender, chainId: $chainId },
                orderBy: "timestamp",
                orderDirection: "desc",
                limit: $limit,
                after: $after
            ) {
                items {
                    id tokenAddr sender txFrom tokenIsToken0 amount0 amount1 timestamp transactionHash protocol
                }
            }
        }
    `
    const data = await ponderRequest<V3SwapPage>(query, { sender, chainId, limit, after })
    const countQuery = `
        query UserV3Count($sender: String!, $chainId: Int!) {
            v3SwapEvents(where: { txFrom: $sender, chainId: $chainId }, limit: 0) { items { id } }
        }
    `
    const countData = await ponderRequest<V3SwapPage>(countQuery, {
        sender,
        chainId,
        limit: 0,
    })
    return {
        items: data.v3SwapEvents.items,
        totalCount: countData.v3SwapEvents.items.length,
    }
}

// External V2 (non-Junoswap) swaps routed through this frontend. The v2_swap_event
// table only holds frontend-originated swaps (the indexer skips untagged ones), so
// no referrer/viaFrontend filter is needed here — just the user's own swaps.
async function fetchV2Events(
    sender: string,
    chainId: number,
    limit: number,
    after?: string
): Promise<{ items: V2SwapPage['v2SwapEvents']['items']; totalCount: number }> {
    const query = `
        query UserV2Activity($sender: String!, $chainId: Int!, $limit: Int!, $after: String) {
            v2SwapEvents(
                where: { txFrom: $sender, chainId: $chainId },
                orderBy: "timestamp",
                orderDirection: "desc",
                limit: $limit,
                after: $after
            ) {
                items {
                    id txFrom token0Addr token1Addr amount0In amount1In amount0Out amount1Out timestamp transactionHash protocol
                }
            }
        }
    `
    const data = await ponderRequest<V2SwapPage>(query, { sender, chainId, limit, after })
    const countQuery = `
        query UserV2Count($sender: String!, $chainId: Int!) {
            v2SwapEvents(where: { txFrom: $sender, chainId: $chainId }, limit: 0) { items { id } }
        }
    `
    const countData = await ponderRequest<V2SwapPage>(countQuery, {
        sender,
        chainId,
        limit: 0,
    })
    return {
        items: data.v2SwapEvents.items,
        totalCount: countData.v2SwapEvents.items.length,
    }
}

async function fetchTransferEvents(
    sender: string,
    limit: number
): Promise<{ items: TransferPage['transferEvents']['items']; totalCount: number }> {
    // The generated Ponder filter supports OR, so a single query covers both
    // incoming and outgoing transfers for the connected wallet.
    const query = `
        query UserTransfers($sender: String!, $limit: Int!) {
            transferEvents(
                where: { OR: [{ from: $sender }, { to: $sender }] },
                orderBy: "timestamp",
                orderDirection: "desc",
                limit: $limit
            ) {
                items {
                    id tokenAddr from to amount timestamp transactionHash
                }
            }
        }
    `
    const data = await ponderRequest<TransferPage>(query, { sender, limit })
    const countQuery = `
        query UserTransferCount($sender: String!) {
            transferEvents(where: { OR: [{ from: $sender }, { to: $sender }] }, limit: 0) { items { id } }
        }
    `
    const countData = await ponderRequest<TransferPage>(countQuery, { sender })
    return {
        items: data.transferEvents.items,
        totalCount: countData.transferEvents.items.length,
    }
}

async function fetchTokenMeta(): Promise<Map<string, TokenMeta>> {
    const query = `
        query TokenMeta {
            launchTokens(limit: 1000) {
                items { tokenAddr logo name symbol }
            }
        }
    `
    const data = await ponderRequest<TokenMetaPage>(query, {})
    const map = new Map<string, TokenMeta>()
    for (const t of data.launchTokens.items) {
        // Launch tokens are always 18-decimal.
        map.set(t.tokenAddr.toLowerCase(), {
            symbol: t.symbol || '',
            name: t.name || '',
            logo: t.logo || '',
            decimals: 18,
        })
    }
    return map
}

// V3 token metadata lives in its own per-chain table (not launchTokens), so V3
// trades on chains without a launchpad — or for tokens that never launched —
// still resolve to a real symbol/name instead of a truncated address.
async function fetchV3TokenMeta(chainId: number): Promise<Map<string, TokenMeta>> {
    const query = `
        query V3TokenMeta($chainId: Int!) {
            v3Tokens(where: { chainId: $chainId }, limit: 500) {
                items { address symbol name decimals }
            }
        }
    `
    const data = await ponderRequest<V3TokenMetaPage>(query, { chainId })
    const map = new Map<string, TokenMeta>()
    for (const t of data.v3Tokens.items) {
        map.set(t.address.toLowerCase(), {
            symbol: t.symbol || '',
            name: t.name || '',
            logo: '',
            decimals: t.decimals ?? 18,
        })
    }
    return map
}

export function useUserActivity(
    address: Address | undefined,
    chainId: number,
    page: number = 1,
    typeFilter: 'all' | 'buy' | 'sell' = 'all'
) {
    const isSupportedChain = isLeaderboardSupportedChain(chainId)
    const hasLaunchpad = isLaunchpadChain(chainId)

    return useQuery({
        queryKey: ['user-activity', address, chainId, page, typeFilter],
        queryFn: async (): Promise<{ data: ActivityEvent[]; totalCount: number }> => {
            if (!address || !isSupportedChain) return { data: [], totalCount: 0 }

            const sender = address.toLowerCase()

            try {
                // Bonding-curve trades, transfers, and launch-token metadata are
                // launchpad-only. V3 trades are indexed for all supported chains.
                const [launchMeta, v3Meta, bcResult, v3Result, v2Result, transferResult] =
                    await Promise.all([
                        hasLaunchpad
                            ? fetchTokenMeta()
                            : Promise.resolve(new Map<string, TokenMeta>()),
                        fetchV3TokenMeta(chainId),
                        hasLaunchpad
                            ? fetchBondingCurveEvents(sender, PAGE_SIZE + 50)
                            : Promise.resolve({ items: [], totalCount: 0 }),
                        fetchV3Events(sender, chainId, PAGE_SIZE + 50),
                        fetchV2Events(sender, chainId, PAGE_SIZE + 50),
                        hasLaunchpad
                            ? fetchTransferEvents(sender, PAGE_SIZE + 50)
                            : Promise.resolve({ items: [], totalCount: 0 }),
                    ])

                // Merge: launchpad tokens carry a logo, so they take precedence;
                // the static per-chain list fills in logos for known tokens on
                // chains without a launchpad (KUB mainnet, JB chain) and for V3
                // swaps of static tokens on KUB testnet; V3 metadata fills in
                // symbol/name for any remaining tokens.
                const tokenMeta = new Map(launchMeta)
                for (const t of getTokensForChain(chainId)) {
                    const addr = t.address.toLowerCase()
                    if (!tokenMeta.has(addr)) {
                        tokenMeta.set(addr, {
                            symbol: t.symbol,
                            name: t.name,
                            logo: t.logo ?? '',
                            decimals: t.decimals ?? 18,
                        })
                    }
                }
                for (const [addr, meta] of v3Meta) {
                    if (!tokenMeta.has(addr)) tokenMeta.set(addr, meta)
                }

                // Map bonding curve events
                const bcEvents: ActivityEvent[] = bcResult.items.map((e) => {
                    const meta = tokenMeta.get(e.tokenAddr.toLowerCase())
                    return {
                        kind: 'trade' as const,
                        id: e.id,
                        tokenAddr: e.tokenAddr.toLowerCase(),
                        tokenSymbol: meta?.symbol || e.tokenAddr.slice(0, 6) + '…',
                        tokenName: meta?.name || '',
                        tokenLogo: meta?.logo || '',
                        isBuy: e.isBuy === 1,
                        amountIn: e.amountIn,
                        amountOut: e.amountOut,
                        protocol: 'junoswap',
                        timestamp: e.timestamp,
                        transactionHash: e.transactionHash,
                        sender: e.sender,
                    }
                })

                // Map V3 events — amount0/amount1 are pool-perspective signed
                // deltas (positive = into pool, negative = out of pool). Use
                // tokenIsToken0 to pick which side is the token vs native, since
                // the launch token can sort to either side of WKUB. Mirrors the
                // proven decode in useUserSwapEvents.ts.
                const v3Events: ActivityEvent[] = v3Result.items.map((e) => {
                    const tokenIsToken0 = e.tokenIsToken0 === 1
                    const tokenAmt = BigInt(tokenIsToken0 ? e.amount0 : e.amount1)
                    const nativeAmt = BigInt(tokenIsToken0 ? e.amount1 : e.amount0)
                    const abs = (x: bigint) => (x < 0n ? -x : x)
                    const isBuy = tokenAmt < 0n // token leaves the pool => user receives it
                    const meta = tokenMeta.get(e.tokenAddr.toLowerCase())
                    return {
                        kind: 'trade' as const,
                        id: e.id,
                        tokenAddr: e.tokenAddr.toLowerCase(),
                        tokenSymbol: meta?.symbol || e.tokenAddr.slice(0, 6) + '…',
                        tokenName: meta?.name || '',
                        tokenLogo: meta?.logo || '',
                        isBuy,
                        amountIn: (isBuy ? abs(nativeAmt) : abs(tokenAmt)).toString(),
                        amountOut: (isBuy ? abs(tokenAmt) : abs(nativeAmt)).toString(),
                        // Default guards rows indexed before the protocol column existed.
                        protocol: e.protocol || 'junoswap',
                        timestamp: e.timestamp,
                        transactionHash: e.transactionHash,
                        sender: e.txFrom,
                    }
                })

                // Map V2 events with the generalized two-leg model (works for any
                // pairing, incl. token/token). The side with a positive `In` is what
                // the user sold; the side with a positive `Out` is what they bought.
                const legMeta = (addr: string): ActivityLeg => {
                    const a = addr.toLowerCase()
                    const m = tokenMeta.get(a)
                    return {
                        tokenAddr: a,
                        symbol: m?.symbol || a.slice(0, 6) + '…',
                        logo: m?.logo || '',
                        amount: '0',
                        decimals: m?.decimals ?? 18,
                    }
                }
                const v2Events: ActivityEvent[] = v2Result.items.map((e) => {
                    const sellToken0 = BigInt(e.amount0In) > 0n
                    const soldAddr = sellToken0 ? e.token0Addr : e.token1Addr
                    const boughtAddr = sellToken0 ? e.token1Addr : e.token0Addr
                    const soldAmt = (sellToken0 ? e.amount0In : e.amount1In).toString()
                    const boughtAmt = (sellToken0 ? e.amount1Out : e.amount0Out).toString()
                    const sell = { ...legMeta(soldAddr), amount: soldAmt }
                    const buy = { ...legMeta(boughtAddr), amount: boughtAmt }
                    return {
                        kind: 'trade' as const,
                        id: e.id,
                        tokenAddr: buy.tokenAddr,
                        tokenSymbol: buy.symbol,
                        tokenName: '',
                        tokenLogo: buy.logo,
                        isBuy: true,
                        amountIn: soldAmt,
                        amountOut: boughtAmt,
                        protocol: e.protocol,
                        sell,
                        buy,
                        timestamp: e.timestamp,
                        transactionHash: e.transactionHash,
                        sender: e.txFrom,
                    }
                })

                // Swap tx hashes — a swap moves the token between pool and trader in
                // the same tx, emitting a Transfer we'd otherwise show twice. Drop
                // any transfer whose tx already produced a swap.
                const swapTxHashes = new Set([
                    ...bcResult.items.map((e) => e.transactionHash),
                    ...v3Result.items.map((e) => e.transactionHash),
                    ...v2Result.items.map((e) => e.transactionHash),
                ])

                const transferEvents: ActivityEvent[] = transferResult.items
                    .filter((e) => !swapTxHashes.has(e.transactionHash))
                    .map((e) => {
                        const isReceived = e.to.toLowerCase() === sender
                        const meta = tokenMeta.get(e.tokenAddr.toLowerCase())
                        return {
                            kind: 'transfer' as const,
                            id: e.id,
                            tokenAddr: e.tokenAddr.toLowerCase(),
                            tokenSymbol: meta?.symbol || e.tokenAddr.slice(0, 6) + '…',
                            tokenName: meta?.name || '',
                            tokenLogo: meta?.logo || '',
                            isBuy: false,
                            amountIn: '0',
                            amountOut: '0',
                            direction: isReceived ? ('in' as const) : ('out' as const),
                            counterparty: (isReceived ? e.from : e.to).toLowerCase(),
                            transferAmount: e.amount,
                            timestamp: e.timestamp,
                            transactionHash: e.transactionHash,
                            sender,
                        }
                    })

                // Merge and sort descending
                let allEvents = [...bcEvents, ...v3Events, ...v2Events, ...transferEvents].sort(
                    (a, b) => b.timestamp - a.timestamp
                )

                // Apply type filter — buy/sell are trade-only filters; exclude transfers
                if (typeFilter !== 'all') {
                    const isBuyFilter = typeFilter === 'buy'
                    allEvents = allEvents.filter(
                        (e) => e.kind === 'trade' && e.isBuy === isBuyFilter
                    )
                }

                const totalCount = allEvents.length
                const start = (page - 1) * PAGE_SIZE
                const data = allEvents.slice(start, start + PAGE_SIZE)

                return { data, totalCount }
            } catch (e) {
                if (isPonderError(e)) return { data: [], totalCount: 0 }
                throw e
            }
        },
        enabled: !!address && isSupportedChain,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })
}
