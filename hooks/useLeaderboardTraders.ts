'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useChainId } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { isNativeToken } from '@/lib/wagmi'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import { isLaunchpadChain } from '@/lib/abis/bonding-curve-junoswap'
import { useTokenDiscovery } from '@/hooks/use-token-discovery'
import { useMultiBalances } from '@/hooks/use-multi-balances'
import { useTokenPrices } from '@/hooks/use-token-prices'
import { useNativeUsdPriceHistory } from '@/hooks/useNativeUsdPriceHistory'
import {
    computeTraderStatsByAddress,
    type LeaderboardSwapEvent,
} from '@/services/dex/portfolio-pnl'
import {
    getTimeThreshold,
    fetchSwapEvents,
    fetchV3SwapEvents,
    fetchV2SwapEvents,
} from '@/lib/leaderboard-utils'
import type { LeaderboardTimePeriod, TraderSortKey, SortDirection } from '@/types/leaderboard'

export interface TraderAgg {
    rank: number
    address: string
    netWorthNative: number
    pnlUsd: number
    pnlPercent: number
    volumeNative: number
    tradeCount: number
    buyCount: number
    sellCount: number
}

interface HolderRow {
    address: string
    tokenAddr: string
    balance: string
}

interface HoldersResponse {
    tokenHolders: { items: HolderRow[] }
}

const PAGE_SIZE = 20

async function fetchTokenHolders(): Promise<HolderRow[]> {
    const query = `{
        tokenHolders(limit: 5000) {
            items { address tokenAddr balance }
        }
    }`
    try {
        const data = await ponderRequest<HoldersResponse>(query)
        return data.tokenHolders.items
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

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

    // Step 1: Fetch Ponder data (swap events + token holders)
    const { data: raw, isLoading: isPonderLoading } = useQuery({
        queryKey: ['leaderboard-traders', timePeriod, chainId],
        queryFn: async () => {
            const since = getTimeThreshold(timePeriod)
            // Bonding-curve swaps and launch-token holders only exist on the
            // launchpad chain; V3 (junoswap + external kublerx) and external V2 swaps
            // are indexed for all supported chains.
            const includeLaunchpad = isLaunchpadChain(chainId)
            const [swapEvents, v3SwapEvents, v2SwapEvents, tokenHolders] = await Promise.all([
                includeLaunchpad ? fetchSwapEvents(since) : Promise.resolve([]),
                fetchV3SwapEvents(chainId, since),
                fetchV2SwapEvents(chainId, since),
                includeLaunchpad ? fetchTokenHolders() : Promise.resolve([]),
            ])
            return {
                swapEvents: [...swapEvents, ...v3SwapEvents, ...v2SwapEvents],
                tokenHolders,
            }
        },
        enabled: isSupportedChain,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    // Step 2: Extract unique addresses
    const uniqueAddresses = useMemo(() => {
        if (!raw) return []
        const addrs = new Set<string>()
        for (const h of raw.tokenHolders) addrs.add(h.address.toLowerCase())
        for (const e of raw.swapEvents) addrs.add(e.sender.toLowerCase())
        return [...addrs] as Address[]
    }, [raw])

    // Step 3a: Fetch native balances via getBalance
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

    // Step 3b: Fetch ERC20 balances for all addresses
    const { holdings, isLoading: isErc20Loading } = useMultiBalances(
        erc20Tokens,
        uniqueAddresses,
        chainId
    )

    // Step 4: Fetch prices
    const priceMap = useTokenPrices(allTokens, chainId, nativeUsdPrice, getTokenType)
    const { priceAt } = useNativeUsdPriceHistory(chainId, nativeUsdPrice)

    // Step 5: Build numeric holder map for swap aggregation
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

    // Token decimals so the PnL engine decodes swap amounts at the right scale
    // (6-decimal tokens like USDT otherwise produce astronomical cost bases).
    const decimalsByToken = useMemo(() => {
        const map = new Map<string, number>()
        for (const token of erc20Tokens) {
            map.set(token.address.toLowerCase(), token.decimals)
        }
        return map
    }, [erc20Tokens])

    // Step 6: Per-trader PNL (same engine as the portfolio), volume & trade counts
    const perAddressStats = useMemo(() => {
        const events: LeaderboardSwapEvent[] =
            raw?.swapEvents.map((e) => ({
                tokenAddr: e.tokenAddr,
                sender: e.sender,
                isBuy: e.isBuy === 1,
                amountIn: e.amountIn,
                amountOut: e.amountOut,
                timestamp: e.timestamp,
            })) ?? []
        return computeTraderStatsByAddress(
            events,
            numericHolderMap,
            priceMap,
            priceAt,
            decimalsByToken
        )
    }, [raw, numericHolderMap, priceMap, priceAt, decimalsByToken])

    // Step 7: Compute net worth per address, merge with swap stats, sort & paginate
    const result = useMemo(() => {
        if (!raw) return { traders: [], totalCount: 0, totalPages: 0 }

        // Net worth in native terms
        const netWorthByAddress = new Map<string, number>()

        // Add native balance
        if (nativeBalanceMap) {
            for (const [addr, nativeBal] of nativeBalanceMap) {
                if (nativeBal > 0) netWorthByAddress.set(addr, nativeBal)
            }
        }

        // Add ERC20 balance value from holdings
        for (const [addr, tokenHoldings] of numericHolderMap) {
            let netWorth = netWorthByAddress.get(addr) ?? 0
            for (const [tokenAddr, balance] of tokenHoldings) {
                const priceUsd = priceMap.get(tokenAddr) ?? 0
                const priceNative = nativeUsdPrice ? priceUsd / nativeUsdPrice : 0
                netWorth += balance * priceNative
            }
            if (netWorth > 0) netWorthByAddress.set(addr, netWorth)
        }

        // Build address set
        const allAddresses = new Set<string>()
        for (const addr of netWorthByAddress.keys()) allAddresses.add(addr)
        for (const addr of perAddressStats.keys()) allAddresses.add(addr)

        const traders: TraderAgg[] = []
        for (const addr of allAddresses) {
            const netWorth = netWorthByAddress.get(addr) ?? 0
            const stats = perAddressStats.get(addr)

            traders.push({
                rank: 0,
                address: addr,
                netWorthNative: netWorth,
                pnlUsd: stats?.pnlUsd ?? 0,
                pnlPercent: stats?.pnlPercent ?? 0,
                volumeNative: stats?.volumeNative ?? 0,
                tradeCount: stats?.tradeCount ?? 0,
                buyCount: stats?.buyCount ?? 0,
                sellCount: stats?.sellCount ?? 0,
            })
        }

        // Sort
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
                    aVal = a.volumeNative
                    bVal = b.volumeNative
                    break
                case 'trades':
                    aVal = a.tradeCount
                    bVal = b.tradeCount
                    break
            }
            return sortDirection === 'desc' ? bVal - aVal : aVal - bVal
        }
        traders.sort(sortFn)

        // Filter by search
        const filtered = searchQuery
            ? traders.filter((t) => t.address.includes(searchQuery.toLowerCase()))
            : traders

        // Assign ranks
        filtered.forEach((t, i) => {
            t.rank = i + 1
        })

        const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
        const paginatedTraders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

        return { traders: paginatedTraders, totalCount: filtered.length, totalPages }
    }, [
        raw,
        sortKey,
        sortDirection,
        searchQuery,
        page,
        nativeBalanceMap,
        numericHolderMap,
        priceMap,
        nativeUsdPrice,
        perAddressStats,
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
        isLoading: isPonderLoading || isNativeLoading || isErc20Loading,
        isSupportedChain,
    }
}
