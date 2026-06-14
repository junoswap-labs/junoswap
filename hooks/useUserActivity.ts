'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import type { ActivityEvent } from '@/types/portfolio'

const PAGE_SIZE = 20

// ── GraphQL response types ──────────────────────────────────────────

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
            amount0: string
            amount1: string
            timestamp: number
            transactionHash: string
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

// ── Fetch helpers ───────────────────────────────────────────────────

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
    limit: number,
    after?: string
): Promise<{ items: V3SwapPage['v3SwapEvents']['items']; totalCount: number }> {
    const query = `
        query UserV3Activity($sender: String!, $limit: Int!, $after: String) {
            v3SwapEvents(
                where: { txFrom: $sender },
                orderBy: "timestamp",
                orderDirection: "desc",
                limit: $limit,
                after: $after
            ) {
                items {
                    id tokenAddr sender txFrom amount0 amount1 timestamp transactionHash
                }
            }
        }
    `
    const data = await ponderRequest<V3SwapPage>(query, { sender, limit, after })
    const countQuery = `
        query UserV3Count($sender: String!) {
            v3SwapEvents(where: { txFrom: $sender }, limit: 0) { items { id } }
        }
    `
    const countData = await ponderRequest<V3SwapPage>(countQuery, {
        sender,
        limit: 0,
    })
    return {
        items: data.v3SwapEvents.items,
        totalCount: countData.v3SwapEvents.items.length,
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

async function fetchTokenMeta(): Promise<
    Map<string, { symbol: string; name: string; logo: string }>
> {
    const query = `
        query TokenMeta {
            launchTokens(limit: 1000) {
                items { tokenAddr logo name symbol }
            }
        }
    `
    const data = await ponderRequest<TokenMetaPage>(query, {})
    const map = new Map<string, { symbol: string; name: string; logo: string }>()
    for (const t of data.launchTokens.items) {
        map.set(t.tokenAddr.toLowerCase(), {
            symbol: t.symbol || '',
            name: t.name || '',
            logo: t.logo || '',
        })
    }
    return map
}

// ── Hook ────────────────────────────────────────────────────────────

export function useUserActivity(
    address: Address | undefined,
    chainId: number,
    page: number = 1,
    typeFilter: 'all' | 'buy' | 'sell' = 'all'
) {
    const isLaunchpadChain = chainId === PUMP_CORE_NATIVE_CHAIN_ID

    return useQuery({
        queryKey: ['user-activity', address, chainId, page, typeFilter],
        queryFn: async (): Promise<{ data: ActivityEvent[]; totalCount: number }> => {
            if (!address || !isLaunchpadChain) return { data: [], totalCount: 0 }

            const sender = address.toLowerCase()

            try {
                const [tokenMeta, bcResult, v3Result, transferResult] = await Promise.all([
                    fetchTokenMeta(),
                    fetchBondingCurveEvents(sender, PAGE_SIZE + 50),
                    fetchV3Events(sender, PAGE_SIZE + 50),
                    fetchTransferEvents(sender, PAGE_SIZE + 50),
                ])

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
                        timestamp: e.timestamp,
                        transactionHash: e.transactionHash,
                        sender: e.sender,
                    }
                })

                // Map V3 events — compute isBuy from amount0 sign
                const v3Events: ActivityEvent[] = v3Result.items.map((e) => {
                    const amount0 = BigInt(e.amount0)
                    const amount1 = BigInt(e.amount1)
                    const isBuy = amount0 < 0n
                    const meta = tokenMeta.get(e.tokenAddr.toLowerCase())
                    return {
                        kind: 'trade' as const,
                        id: e.id,
                        tokenAddr: e.tokenAddr.toLowerCase(),
                        tokenSymbol: meta?.symbol || e.tokenAddr.slice(0, 6) + '…',
                        tokenName: meta?.name || '',
                        tokenLogo: meta?.logo || '',
                        isBuy,
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
                        transactionHash: e.transactionHash,
                        sender: e.txFrom,
                    }
                })

                // Swap tx hashes — a V3 swap moves the token between pool and
                // trader in the same tx, emitting a Transfer we'd otherwise show
                // twice. Drop any transfer whose tx already produced a swap.
                const swapTxHashes = new Set([
                    ...bcResult.items.map((e) => e.transactionHash),
                    ...v3Result.items.map((e) => e.transactionHash),
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
                let allEvents = [...bcEvents, ...v3Events, ...transferEvents].sort(
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
        enabled: !!address && isLaunchpadChain,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })
}
