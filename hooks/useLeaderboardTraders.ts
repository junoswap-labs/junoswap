'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useChainId } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { isNativeToken } from '@/lib/wagmi'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import { fetchTokenHolders } from '@coshi190/juno-moneta-sdk'
import { getBondingCurveDeployment } from '@/lib/deployments'
import { useTokenDiscovery } from '@/hooks/useTokenDiscovery'
import { useMultiBalances } from '@/hooks/useMultiBalances'
import { useTokenPrices } from '@/hooks/useTokenPrices'
import { fetchLeaderboardTraders, type LeaderboardTraderStat } from '@/lib/user-pnl'
import type { LeaderboardTimePeriod, TraderSortKey, SortDirection } from '@/types/leaderboard'

export interface TraderAgg {
    rank: number
    address: string
    netWorthNative: number
    pnlUsd: number
    pnlPercent: number
    volumeUsd: number
    tradeCount: number
    buyCount: number
    sellCount: number
}

const PAGE_SIZE = 20

const HOLDER_ADDRESS_FIELDS = ['address'] as const

async function fetchHolders(chainId: number): Promise<string[]> {
    try {
        const rows = await fetchTokenHolders(ponderClient, { chainId }, HOLDER_ADDRESS_FIELDS)
        return rows.map((h) => h.address)
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

/**
 * Trader PnL/volume/counts come precomputed from the indexer's `/leaderboard` route for every period
 * (all-time from the cumulative folds, windows folded on the fly server-side). Net worth is assembled
 * here from live on-chain balances and merged in.
 */
export function useLeaderboardTraders(
    timePeriod: LeaderboardTimePeriod,
    sortKey: TraderSortKey,
    sortDirection: SortDirection,
    searchQuery: string,
    page: number,
    nativeUsdPrice: number | null
) {
    const chainId = useChainId()
    const isSupportedChain = isLeaderboardSupportedChain(chainId)
    const { allTokens, getTokenType } = useTokenDiscovery(chainId)

    const erc20Tokens = useMemo(
        () => allTokens.filter((t) => !isNativeToken(t.address)),
        [allTokens]
    )

    const { data: holders, isLoading: isHoldersLoading } = useQuery({
        queryKey: ['leaderboard-holders', chainId],
        queryFn: () =>
            getBondingCurveDeployment(chainId) !== undefined
                ? fetchHolders(chainId)
                : Promise.resolve([]),
        enabled: isSupportedChain,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const { data: traderStats, isLoading: isStatsLoading } = useQuery({
        queryKey: ['leaderboard-server', chainId, timePeriod],
        queryFn: () => fetchLeaderboardTraders(chainId, timePeriod),
        enabled: isSupportedChain,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    const uniqueAddresses = useMemo(() => {
        const addrs = new Set<string>()
        for (const a of holders ?? []) addrs.add(a.toLowerCase())
        for (const t of traderStats ?? []) addrs.add(t.address.toLowerCase())
        return [...addrs] as Address[]
    }, [holders, traderStats])

    const publicClient = usePublicClient({ chainId })

    const { data: nativeBalanceMap, isLoading: isNativeLoading } = useQuery({
        queryKey: ['leaderboard-native-balances', uniqueAddresses, chainId],
        queryFn: async () => {
            const map = new Map<string, number>()
            const results = await Promise.all(
                uniqueAddresses.map(async (addr) => {
                    const balance = await publicClient!.getBalance({ address: addr })
                    return { addr: addr.toLowerCase(), balance }
                })
            )
            for (const { addr, balance } of results) {
                if (balance > 0n) {
                    map.set(addr, parseFloat(formatEther(balance)))
                }
            }
            return map
        },
        enabled: uniqueAddresses.length > 0 && !!publicClient,
    })

    const { holdings, isLoading: isErc20Loading } = useMultiBalances(
        erc20Tokens,
        uniqueAddresses,
        chainId
    )

    const { prices: priceMap } = useTokenPrices(allTokens, chainId, nativeUsdPrice, getTokenType)

    const numericHolderMap = useMemo(() => {
        const map = new Map<string, Map<string, number>>()
        for (const [addr, tokenHoldings] of holdings) {
            const tokenMap = new Map<string, number>()
            for (const [tokenAddr, holding] of tokenHoldings) {
                tokenMap.set(tokenAddr, Number(holding.formattedBalance))
            }
            if (tokenMap.size > 0) map.set(addr, tokenMap)
        }
        return map
    }, [holdings])

    const statsByAddress = useMemo(() => {
        const map = new Map<string, LeaderboardTraderStat>()
        for (const t of traderStats ?? []) map.set(t.address.toLowerCase(), t)
        return map
    }, [traderStats])

    const result = useMemo(() => {
        if (traderStats === undefined) return { traders: [], totalCount: 0, totalPages: 0 }

        const netWorthByAddress = new Map<string, number>()

        if (nativeBalanceMap) {
            for (const [addr, nativeBal] of nativeBalanceMap) {
                if (nativeBal > 0) netWorthByAddress.set(addr, nativeBal)
            }
        }

        for (const [addr, tokenHoldings] of numericHolderMap) {
            let netWorth = netWorthByAddress.get(addr) ?? 0
            for (const [tokenAddr, balance] of tokenHoldings) {
                const priceUsd = priceMap.get(tokenAddr) ?? 0
                const priceNative = nativeUsdPrice ? priceUsd / nativeUsdPrice : 0
                netWorth += balance * priceNative
            }
            if (netWorth > 0) netWorthByAddress.set(addr, netWorth)
        }

        const allAddresses = new Set<string>()
        for (const addr of netWorthByAddress.keys()) allAddresses.add(addr)
        for (const addr of statsByAddress.keys()) allAddresses.add(addr)

        const traders: TraderAgg[] = []
        for (const addr of allAddresses) {
            const netWorth = netWorthByAddress.get(addr) ?? 0
            const stats = statsByAddress.get(addr)

            traders.push({
                rank: 0,
                address: addr,
                netWorthNative: netWorth,
                pnlUsd: stats?.pnlUsd ?? 0,
                pnlPercent: stats?.pnlPercent ?? 0,
                volumeUsd: stats?.volumeUsd ?? 0,
                tradeCount: stats?.tradeCount ?? 0,
                buyCount: stats?.buyCount ?? 0,
                sellCount: stats?.sellCount ?? 0,
            })
        }

        const sortFn = (a: TraderAgg, b: TraderAgg) => {
            let aVal: number, bVal: number
            switch (sortKey) {
                case 'netWorth':
                    aVal = a.netWorthNative
                    bVal = b.netWorthNative
                    break
                case 'pnl':
                    aVal = a.pnlUsd
                    bVal = b.pnlUsd
                    break
                case 'volume':
                    aVal = a.volumeUsd
                    bVal = b.volumeUsd
                    break
                case 'trades':
                    aVal = a.tradeCount
                    bVal = b.tradeCount
                    break
            }
            return sortDirection === 'desc' ? bVal - aVal : aVal - bVal
        }
        traders.sort(sortFn)

        const filtered = searchQuery
            ? traders.filter((t) => t.address.includes(searchQuery.toLowerCase()))
            : traders

        filtered.forEach((t, i) => {
            t.rank = i + 1
        })

        const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
        const paginatedTraders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

        return { traders: paginatedTraders, totalCount: filtered.length, totalPages }
    }, [
        traderStats,
        sortKey,
        sortDirection,
        searchQuery,
        page,
        nativeBalanceMap,
        numericHolderMap,
        priceMap,
        nativeUsdPrice,
        statsByAddress,
    ])

    if (!isSupportedChain) {
        return {
            traders: [],
            totalCount: 0,
            totalPages: 0,
            isLoading: false,
            isSupportedChain,
        }
    }

    return {
        traders: result.traders,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
        isLoading: isStatsLoading || isHoldersLoading || isNativeLoading || isErc20Loading,
        isSupportedChain,
    }
}
