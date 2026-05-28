'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReadContracts } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { getTokensForChain } from '@/lib/tokens'
import { isNativeToken } from '@/lib/wagmi'
import { getV3Config } from '@/lib/dex-config'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import { getTimeThreshold, fetchSwapEvents, safeFormatEther } from '@/lib/leaderboard-utils'
import type { LeaderboardTimePeriod, TraderSortKey, SortDirection } from '@/types/leaderboard'
import type { Token } from '@/types/tokens'

const Q96 = 2n ** 96n
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const STABLECOIN_SYMBOLS = new Set(['USDT', 'USDC', 'KUSDT', 'JUSDT', 'DAI', 'BUSD'])

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const
const MULTICALL3_ABI = [
    {
        inputs: [{ name: 'addr', type: 'address' }],
        name: 'getEthBalance',
        outputs: [{ name: 'balance', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const

interface HolderRow {
    address: string
    tokenAddr: string
    balance: string
}

interface SnapshotRow {
    tokenAddr: string
    lastPrice: string
}

interface HoldersResponse {
    tokenHolders: { items: HolderRow[] }
}

interface SnapshotsResponse {
    tokenSnapshots: { items: SnapshotRow[] }
}

export interface TraderAgg {
    rank: number
    address: string
    netWorthNative: number
    pnlNative: number
    pnlPercent: number
    volumeNative: number
    tradeCount: number
    buyCount: number
    sellCount: number
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

async function fetchTokenSnapshots(): Promise<SnapshotRow[]> {
    const query = `{
        tokenSnapshots(limit: 5000) {
            items { tokenAddr lastPrice }
        }
    }`
    try {
        const data = await ponderRequest<SnapshotsResponse>(query)
        return data.tokenSnapshots.items
    } catch (e) {
        if (isPonderError(e)) return []
        throw e
    }
}

function isWrappedNative(token: Token, chainId: number): boolean {
    const wrapped = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    return !!wrapped && token.address.toLowerCase() === wrapped.toLowerCase()
}

export function useLeaderboardTraders(
    timePeriod: LeaderboardTimePeriod,
    sortKey: TraderSortKey,
    sortDirection: SortDirection,
    searchQuery: string,
    page: number,
    nativeUsdPrice: number | null
) {
    const v3Config = getV3Config(PUMP_CORE_NATIVE_CHAIN_ID)
    const wrappedNative = INTERMEDIARY_TOKENS[PUMP_CORE_NATIVE_CHAIN_ID]?.wrappedNative
    const feeTiers = useMemo(() => v3Config?.feeTiers ?? [3000], [v3Config])

    const { tokens: graduatedTokens } = useGraduatedTokens(PUMP_CORE_NATIVE_CHAIN_ID)

    const staticErc20Tokens = useMemo(
        () => getTokensForChain(PUMP_CORE_NATIVE_CHAIN_ID).filter((t) => !isNativeToken(t.address)),
        []
    )

    const allErc20Tokens = useMemo(() => {
        const seen = new Set<string>()
        const merged: Token[] = []
        for (const t of staticErc20Tokens) {
            const key = t.address.toLowerCase()
            if (!seen.has(key)) {
                seen.add(key)
                merged.push(t)
            }
        }
        for (const t of graduatedTokens) {
            const key = t.address.toLowerCase()
            if (!seen.has(key)) {
                seen.add(key)
                merged.push(t)
            }
        }
        return merged
    }, [staticErc20Tokens, graduatedTokens])

    const v3PricedTokens = useMemo(
        () =>
            allErc20Tokens.filter(
                (t) =>
                    !isWrappedNative(t, PUMP_CORE_NATIVE_CHAIN_ID) &&
                    !STABLECOIN_SYMBOLS.has(t.symbol.toUpperCase())
            ),
        [allErc20Tokens]
    )

    // --- Step 1: Fetch Ponder data ---
    const { data: raw, isLoading: isPonderLoading } = useQuery({
        queryKey: ['leaderboard-traders', timePeriod],
        queryFn: async () => {
            const since = getTimeThreshold(timePeriod)
            const [swapEvents, tokenHolders, tokenSnapshots] = await Promise.all([
                fetchSwapEvents(since),
                fetchTokenHolders(),
                fetchTokenSnapshots(),
            ])
            return { swapEvents, tokenHolders, tokenSnapshots }
        },
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    // --- Step 2: Extract unique addresses ---
    const uniqueAddresses = useMemo(() => {
        if (!raw) return []
        const addrs = new Set<string>()
        for (const h of raw.tokenHolders) addrs.add(h.address.toLowerCase())
        for (const e of raw.swapEvents) addrs.add(e.sender.toLowerCase())
        return [...addrs] as Address[]
    }, [raw])

    // --- Step 3: Fetch native balances via Multicall3 ---
    const { data: nativeBalanceResults, isLoading: isNativeLoading } = useReadContracts({
        contracts: uniqueAddresses.map((addr) => ({
            address: MULTICALL3_ADDRESS,
            abi: MULTICALL3_ABI,
            functionName: 'getEthBalance' as const,
            args: [addr],
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        })),
        query: { enabled: uniqueAddresses.length > 0 },
    })

    const nativeBalanceMap = useMemo(() => {
        const map = new Map<string, number>()
        if (!nativeBalanceResults) return map
        uniqueAddresses.forEach((addr, i) => {
            const balance = nativeBalanceResults[i]?.result as bigint | undefined
            if (balance) {
                map.set(addr.toLowerCase(), parseFloat(formatEther(balance)))
            }
        })
        return map
    }, [nativeBalanceResults, uniqueAddresses])

    // --- Step 4: Fetch ERC20 balances (static + graduated tokens) ---
    const { data: erc20BalanceResults, isLoading: isErc20Loading } = useReadContracts({
        contracts: uniqueAddresses.flatMap((addr) =>
            allErc20Tokens.map((token) => ({
                address: token.address as Address,
                abi: ERC20_ABI,
                functionName: 'balanceOf' as const,
                args: [addr],
                chainId: PUMP_CORE_NATIVE_CHAIN_ID,
            }))
        ),
        query: { enabled: uniqueAddresses.length > 0 && allErc20Tokens.length > 0 },
    })

    const erc20BalanceMap = useMemo(() => {
        const map = new Map<string, Map<string, number>>()
        if (!erc20BalanceResults) return map
        const numTokens = allErc20Tokens.length
        uniqueAddresses.forEach((addr, addrIdx) => {
            const tokenMap = new Map<string, number>()
            allErc20Tokens.forEach((token, tokenIdx) => {
                const resultIdx = addrIdx * numTokens + tokenIdx
                const balance = erc20BalanceResults[resultIdx]?.result as bigint | undefined
                if (balance && balance > 0n) {
                    tokenMap.set(token.address.toLowerCase(), parseFloat(formatEther(balance)))
                }
            })
            if (tokenMap.size > 0) {
                map.set(addr.toLowerCase(), tokenMap)
            }
        })
        return map
    }, [erc20BalanceResults, uniqueAddresses, allErc20Tokens])

    // --- Step 4b: Discover bonding-curve tokens from launchTokens and fetch on-chain balances ---
    const knownTokenAddrs = useMemo(() => {
        const set = new Set<string>()
        for (const t of allErc20Tokens) set.add(t.address.toLowerCase())
        return set
    }, [allErc20Tokens])

    interface LaunchTokenResponse {
        launchTokens: { items: Array<{ tokenAddr: string; isGraduated: number }> }
    }

    const { data: bondingCurveTokens } = useQuery({
        queryKey: ['bonding-curve-token-addresses'],
        queryFn: async () => {
            try {
                const data = await ponderRequest<LaunchTokenResponse>(`{
                    launchTokens(where: { isGraduated: 0 }) {
                        items { tokenAddr isGraduated }
                    }
                }`)
                return data.launchTokens.items
                    .filter((t) => t.isGraduated === 0)
                    .map((t) => t.tokenAddr.toLowerCase())
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        staleTime: 60_000,
    })

    const bondingCurveTokenAddrs = useMemo(
        () => (bondingCurveTokens ?? []).filter((a) => !knownTokenAddrs.has(a)) as Address[],
        [bondingCurveTokens, knownTokenAddrs]
    )

    const { data: bcBalanceResults, isLoading: isBcLoading } = useReadContracts({
        contracts: uniqueAddresses.flatMap((addr) =>
            bondingCurveTokenAddrs.map((tokenAddr) => ({
                address: tokenAddr,
                abi: ERC20_ABI,
                functionName: 'balanceOf' as const,
                args: [addr],
                chainId: PUMP_CORE_NATIVE_CHAIN_ID,
            }))
        ),
        query: { enabled: uniqueAddresses.length > 0 && bondingCurveTokenAddrs.length > 0 },
    })

    const bondingCurveBalanceMap = useMemo(() => {
        const map = new Map<string, Map<string, number>>()
        if (!bcBalanceResults) return map
        const numTokens = bondingCurveTokenAddrs.length
        uniqueAddresses.forEach((addr, addrIdx) => {
            const tokenMap = new Map<string, number>()
            bondingCurveTokenAddrs.forEach((tokenAddr, tokenIdx) => {
                const resultIdx = addrIdx * numTokens + tokenIdx
                const balance = bcBalanceResults[resultIdx]?.result as bigint | undefined
                if (balance && balance > 0n) {
                    tokenMap.set(tokenAddr.toLowerCase(), parseFloat(formatEther(balance)))
                }
            })
            if (tokenMap.size > 0) {
                map.set(addr.toLowerCase(), tokenMap)
            }
        })
        return map
    }, [bcBalanceResults, uniqueAddresses, bondingCurveTokenAddrs])

    // --- Step 5: V3 pool discovery for non-trivial static tokens ---
    const poolDiscoveryCalls = useMemo(() => {
        const calls: Array<{ tokenAddr: string; feeTier: number }> = []
        for (const token of v3PricedTokens) {
            for (const fee of feeTiers) {
                calls.push({ tokenAddr: token.address.toLowerCase(), feeTier: fee })
            }
        }
        return calls
    }, [v3PricedTokens, feeTiers])

    const { data: poolAddressResults } = useReadContracts({
        contracts:
            v3Config && wrappedNative
                ? poolDiscoveryCalls.map(({ tokenAddr, feeTier }) => ({
                      address: v3Config.factory as Address,
                      abi: UNISWAP_V3_FACTORY_ABI,
                      functionName: 'getPool' as const,
                      args: [tokenAddr as Address, wrappedNative as Address, feeTier],
                      chainId: PUMP_CORE_NATIVE_CHAIN_ID,
                  }))
                : [],
        query: { enabled: poolDiscoveryCalls.length > 0 && !!v3Config && !!wrappedNative },
    })

    const poolMap = useMemo(() => {
        const map = new Map<string, Address>()
        if (!poolAddressResults) return map
        for (const [i, { tokenAddr }] of poolDiscoveryCalls.entries()) {
            if (map.has(tokenAddr)) continue
            const pool = poolAddressResults[i]?.result as Address | undefined
            if (pool && pool.toLowerCase() !== ZERO_ADDRESS) {
                map.set(tokenAddr, pool)
            }
        }
        return map
    }, [poolAddressResults, poolDiscoveryCalls])

    const poolAddresses = useMemo(() => [...poolMap.values()], [poolMap])

    const { data: slot0Results } = useReadContracts({
        contracts: poolAddresses.map((poolAddr) => ({
            address: poolAddr,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'slot0' as const,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        })),
        query: { enabled: poolAddresses.length > 0 },
    })

    // --- Step 6: Build on-chain token price map (in native terms) ---
    const onChainPriceMap = useMemo(() => {
        const map = new Map<string, number>()
        for (const token of allErc20Tokens) {
            const key = token.address.toLowerCase()
            if (isWrappedNative(token, PUMP_CORE_NATIVE_CHAIN_ID)) {
                map.set(key, 1)
            } else if (STABLECOIN_SYMBOLS.has(token.symbol.toUpperCase())) {
                if (nativeUsdPrice && nativeUsdPrice > 0) {
                    map.set(key, 1 / nativeUsdPrice)
                }
            } else {
                const poolAddr = poolMap.get(key)
                if (poolAddr && slot0Results && wrappedNative) {
                    const poolIndex = poolAddresses.indexOf(poolAddr)
                    const slot0 = slot0Results[poolIndex]?.result as
                        | [bigint, number, number, number, number, number, boolean]
                        | undefined
                    if (slot0 && slot0[0] !== 0n) {
                        const sqrtPriceX96 = slot0[0]
                        const tokenIsToken0 = key < wrappedNative.toLowerCase()
                        let priceNative: number
                        if (tokenIsToken0) {
                            const priceRaw =
                                (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / (Q96 * Q96)
                            priceNative = Number(priceRaw) / 1e18
                        } else {
                            const priceRaw =
                                (Q96 * Q96 * 10n ** 18n) / (sqrtPriceX96 * sqrtPriceX96)
                            priceNative = Number(priceRaw) / 1e18
                        }
                        map.set(key, priceNative)
                    }
                }
            }
        }
        return map
    }, [allErc20Tokens, nativeUsdPrice, poolMap, slot0Results, poolAddresses, wrappedNative])

    // --- Step 7: Compute net worth ---
    const traders = useMemo(() => {
        if (!raw) return { traders: [], totalCount: 0, totalPages: 0 }

        // Ponder prices (launchpad tokens, in native terms)
        const ponderPriceMap = new Map<string, number>()
        for (const s of raw.tokenSnapshots) {
            const price = parseFloat(s.lastPrice)
            if (price > 0) ponderPriceMap.set(s.tokenAddr.toLowerCase(), price)
        }

        // Combined price map
        const priceMap = new Map(ponderPriceMap)
        for (const [k, v] of onChainPriceMap) priceMap.set(k, v)

        // Combined holder map: Ponder tokenHolders + static ERC20 balances
        const holderMap = new Map<string, Map<string, number>>()
        for (const h of raw.tokenHolders) {
            const addr = h.address.toLowerCase()
            const tokenAddr = h.tokenAddr.toLowerCase()
            const balance = safeFormatEther(h.balance)
            let tokens = holderMap.get(addr)
            if (!tokens) {
                tokens = new Map()
                holderMap.set(addr, tokens)
            }
            tokens.set(tokenAddr, balance)
        }
        for (const [addr, tokenBalances] of erc20BalanceMap) {
            let tokens = holderMap.get(addr)
            if (!tokens) {
                tokens = new Map()
                holderMap.set(addr, tokens)
            }
            for (const [tokenAddr, balance] of tokenBalances) {
                tokens.set(tokenAddr, balance)
            }
        }
        for (const [addr, tokenBalances] of bondingCurveBalanceMap) {
            let tokens = holderMap.get(addr)
            if (!tokens) {
                tokens = new Map()
                holderMap.set(addr, tokens)
            }
            for (const [tokenAddr, balance] of tokenBalances) {
                tokens.set(tokenAddr, balance)
            }
        }

        // Net worth = native balance + sum(balance * price) for all tokens
        const allAddrs = new Set<string>()
        for (const [addr] of holderMap) allAddrs.add(addr)
        for (const addr of nativeBalanceMap.keys()) allAddrs.add(addr)

        const netWorthByAddress = new Map<string, number>()
        for (const addr of allAddrs) {
            let netWorth = nativeBalanceMap.get(addr) ?? 0
            const tokens = holderMap.get(addr)
            if (tokens) {
                for (const [tokenAddr, balance] of tokens) {
                    const price = priceMap.get(tokenAddr) ?? 0
                    netWorth += balance * price
                }
            }
            if (netWorth > 0) netWorthByAddress.set(addr, netWorth)
        }

        // Aggregate swaps by sender
        interface SwapAgg {
            volumeNative: number
            tradeCount: number
            buyCount: number
            sellCount: number
            buysByToken: Map<string, { totalNativePaid: number; totalTokensBought: number }>
        }
        const swapBySender = new Map<string, SwapAgg>()

        for (const e of raw.swapEvents) {
            const sender = e.sender.toLowerCase()
            const isBuy = e.isBuy === 1
            const nativeAmount = safeFormatEther(isBuy ? e.amountIn : e.amountOut)

            let agg = swapBySender.get(sender)
            if (!agg) {
                agg = {
                    volumeNative: 0,
                    tradeCount: 0,
                    buyCount: 0,
                    sellCount: 0,
                    buysByToken: new Map(),
                }
                swapBySender.set(sender, agg)
            }

            agg.volumeNative += nativeAmount
            agg.tradeCount++
            if (isBuy) {
                agg.buyCount++
                const tokenKey = e.tokenAddr.toLowerCase()
                const tokenAcc = agg.buysByToken.get(tokenKey) ?? {
                    totalNativePaid: 0,
                    totalTokensBought: 0,
                }
                tokenAcc.totalNativePaid += safeFormatEther(e.amountIn)
                tokenAcc.totalTokensBought += safeFormatEther(e.amountOut)
                agg.buysByToken.set(tokenKey, tokenAcc)
            } else {
                agg.sellCount++
            }
        }

        // Build address set
        const allAddresses = new Set<string>()
        for (const addr of netWorthByAddress.keys()) allAddresses.add(addr)
        for (const addr of swapBySender.keys()) allAddresses.add(addr)

        const result: TraderAgg[] = []
        for (const addr of allAddresses) {
            const netWorth = netWorthByAddress.get(addr) ?? 0
            const swap = swapBySender.get(addr)

            let pnlNative = 0
            let pnlPercent = 0
            if (swap) {
                let totalCostBasis = 0
                let totalCurrentValue = 0
                for (const [tokenAddr, buyAcc] of swap.buysByToken) {
                    if (buyAcc.totalTokensBought <= 0) continue
                    const avgPrice = buyAcc.totalNativePaid / buyAcc.totalTokensBought
                    const price = priceMap.get(tokenAddr) ?? 0
                    const tokens = holderMap.get(addr)
                    const currentBalance = tokens?.get(tokenAddr) ?? 0
                    totalCostBasis += avgPrice * currentBalance
                    totalCurrentValue += price * currentBalance
                }
                pnlNative = totalCurrentValue - totalCostBasis
                pnlPercent = totalCostBasis > 0 ? (pnlNative / totalCostBasis) * 100 : 0
            }

            result.push({
                rank: 0,
                address: addr,
                netWorthNative: netWorth,
                pnlNative,
                pnlPercent,
                volumeNative: swap?.volumeNative ?? 0,
                tradeCount: swap?.tradeCount ?? 0,
                buyCount: swap?.buyCount ?? 0,
                sellCount: swap?.sellCount ?? 0,
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
                    aVal = a.pnlNative
                    bVal = b.pnlNative
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
        result.sort(sortFn)

        // Filter by search
        const filtered = searchQuery
            ? result.filter((t) => t.address.includes(searchQuery.toLowerCase()))
            : result

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
        erc20BalanceMap,
        bondingCurveBalanceMap,
        onChainPriceMap,
    ])

    return {
        traders: traders.traders,
        totalCount: traders.totalCount,
        totalPages: traders.totalPages,
        isLoading: isPonderLoading || isNativeLoading || isErc20Loading || isBcLoading,
    }
}
