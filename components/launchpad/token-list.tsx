'use client'

import { useMemo, useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import type { Address } from 'viem'
import {
    PUMP_CORE_NATIVE_ADDRESS,
    PUMP_CORE_NATIVE_ABI,
    PUMP_CORE_NATIVE_CHAIN_ID,
} from '@/lib/abis/pump-core-native'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { useTokenList } from '@/hooks/useTokenList'
import { useGraduatedTokenMcap } from '@/hooks/useGraduatedTokenMcap'
import type { LaunchpadSortKey } from '@/types/launchpad'
import { TokenCard } from './token-card'
import { SortTabs } from './sort-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { Coins, Loader2, SearchX } from 'lucide-react'

interface TokenListProps {
    searchQuery?: string
}

export function TokenList({ searchQuery = '' }: TokenListProps) {
    const { tokens, snapshotMap, isLoading } = useTokenList()
    const [sortKey, setSortKey] = useState<LaunchpadSortKey>('last-trade')

    // Batch read ERC20 name/symbol for all tokens
    const { data: nameResults } = useReadContracts({
        contracts: tokens.map((token) => ({
            address: token.address as Address,
            abi: ERC20_ABI,
            functionName: 'name' as const,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        })),
        query: { enabled: tokens.length > 0 },
    })

    const { data: symbolResults } = useReadContracts({
        contracts: tokens.map((token) => ({
            address: token.address as Address,
            abi: ERC20_ABI,
            functionName: 'symbol' as const,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        })),
        query: { enabled: tokens.length > 0 },
    })

    // Batch read reserves for all tokens
    const { data: reserveResults } = useReadContracts({
        contracts: tokens.map((token) => ({
            address: PUMP_CORE_NATIVE_ADDRESS as Address,
            abi: PUMP_CORE_NATIVE_ABI,
            functionName: 'pumpReserve' as const,
            args: [token.address] as const,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        })),
        query: { enabled: tokens.length > 0 },
    })

    const { data: graduatedResults } = useReadContracts({
        contracts: tokens.map((token) => ({
            address: PUMP_CORE_NATIVE_ADDRESS as Address,
            abi: PUMP_CORE_NATIVE_ABI,
            functionName: 'isGraduate' as const,
            args: [token.address] as const,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        })),
        query: { enabled: tokens.length > 0 },
    })

    const { data: graduationAmountResult } = useReadContracts({
        contracts: [
            {
                address: PUMP_CORE_NATIVE_ADDRESS as Address,
                abi: PUMP_CORE_NATIVE_ABI,
                functionName: 'graduationAmount' as const,
                chainId: PUMP_CORE_NATIVE_CHAIN_ID,
            },
        ],
        query: { enabled: tokens.length > 0 },
    })

    const graduationAmount = graduationAmountResult?.[0]?.result as bigint | undefined

    const { data: virtualAmountData } = useReadContract({
        address: PUMP_CORE_NATIVE_ADDRESS as Address,
        abi: PUMP_CORE_NATIVE_ABI,
        functionName: 'virtualAmount',
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        query: { enabled: tokens.length > 0 },
    })
    const virtualAmount = (virtualAmountData as bigint | undefined) ?? 0n

    // Identify graduated token addresses for V3 mcap lookup
    const graduatedAddresses = useMemo(() => {
        if (!graduatedResults) return []
        return tokens.filter((_, i) => graduatedResults[i]?.result === true).map((t) => t.address)
    }, [tokens, graduatedResults])

    const graduatedMcapMap = useGraduatedTokenMcap(graduatedAddresses)

    // Build enriched token data with ERC20 metadata + market cap
    const enrichedTokens = useMemo(() => {
        return tokens.map((token, index) => {
            const reserveResult = reserveResults?.[index]?.result as [bigint, bigint] | undefined
            const nativeReserve = reserveResult?.[0]
            const tokenReserve = reserveResult?.[1]
            const isGraduated = graduatedResults?.[index]?.result as boolean | undefined

            let marketCap: string | undefined
            if (isGraduated) {
                marketCap =
                    graduatedMcapMap.get(token.address.toLowerCase()) ??
                    snapshotMap.get(token.address.toLowerCase())?.marketCapNative
            } else if (
                virtualAmount > 0n &&
                nativeReserve !== undefined &&
                tokenReserve !== undefined &&
                tokenReserve > 0n
            ) {
                const price =
                    parseFloat(formatEther(virtualAmount + nativeReserve)) /
                    parseFloat(formatEther(tokenReserve))
                marketCap = String(price * 1e9)
            }

            return {
                token,
                tokenName: nameResults?.[index]?.result as string | undefined,
                tokenSymbol: symbolResults?.[index]?.result as string | undefined,
                reserveResult,
                isGraduated,
                marketCap,
            }
        })
    }, [
        tokens,
        nameResults,
        symbolResults,
        reserveResults,
        graduatedResults,
        virtualAmount,
        graduatedMcapMap,
    ])

    // Filter by search query
    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return enrichedTokens
        const q = searchQuery.toLowerCase().trim()
        return enrichedTokens.filter(({ token, tokenName, tokenSymbol }) => {
            const symbol = (tokenSymbol || token.symbol || '').toLowerCase()
            const name = (tokenName || token.name || '').toLowerCase()
            const addr = token.address.toLowerCase()
            const creator = token.creator.toLowerCase()
            return symbol.includes(q) || name.includes(q) || addr.includes(q) || creator.includes(q)
        })
    }, [enrichedTokens, searchQuery])

    // Sort by selected key
    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            switch (sortKey) {
                case 'last-trade': {
                    const aLast = snapshotMap.get(a.token.address.toLowerCase())?.lastSwapAt ?? 0
                    const bLast = snapshotMap.get(b.token.address.toLowerCase())?.lastSwapAt ?? 0
                    if (bLast !== aLast) return bLast - aLast
                    return b.token.createdTime - a.token.createdTime
                }
                case 'market-cap': {
                    const aMc = parseFloat(a.marketCap ?? '0')
                    const bMc = parseFloat(b.marketCap ?? '0')
                    return bMc - aMc
                }
                case 'new':
                    return b.token.createdTime - a.token.createdTime
                case 'oldest':
                    return a.token.createdTime - b.token.createdTime
            }
        })
    }, [filtered, sortKey, snapshotMap])

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
                <div className="relative flex h-12 w-12 items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-muted/40" />
                    <Loader2 className="relative h-6 w-6 animate-spin text-primary" />
                </div>
                <span className="text-sm text-muted-foreground">Loading tokens...</span>
            </div>
        )
    }

    if (tokens.length === 0) {
        return (
            <EmptyState
                icon={Coins}
                title="No tokens yet"
                description="Be the first to create a token on the launchpad!"
            />
        )
    }

    if (filtered.length === 0) {
        return (
            <EmptyState
                icon={SearchX}
                title="No results"
                description={`No tokens matching "${searchQuery.trim()}"`}
            />
        )
    }

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <SortTabs value={sortKey} onChange={setSortKey} />
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                {sorted.map(
                    ({ token, tokenName, tokenSymbol, reserveResult, isGraduated, marketCap }) => {
                        const nativeReserve = reserveResult?.[0]

                        return (
                            <TokenCard
                                key={token.address}
                                token={token}
                                tokenName={tokenName}
                                tokenSymbol={tokenSymbol}
                                nativeReserve={nativeReserve}
                                graduationAmount={graduationAmount}
                                marketCap={marketCap}
                                isGraduated={isGraduated}
                            />
                        )
                    }
                )}
            </div>
        </div>
    )
}
