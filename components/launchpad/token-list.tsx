'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { parseEther } from 'viem'
import type { Address } from 'viem'
import {
    PUMP_CORE_NATIVE_ADDRESS,
    PUMP_CORE_NATIVE_ABI,
    PUMP_CORE_NATIVE_CHAIN_ID,
} from '@/lib/abis/pump-core-native'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { useTokenList } from '@/hooks/useTokenList'
import { calculateMarketCap } from '@/services/launchpad'
import { TokenCard } from './token-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Coins, Loader2, SearchX } from 'lucide-react'

const TOTAL_SUPPLY = parseEther('1000000000') // 1 billion

interface TokenListProps {
    searchQuery?: string
}

export function TokenList({ searchQuery = '' }: TokenListProps) {
    const { tokens, isLoading } = useTokenList()

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

    // Build enriched token data with ERC20 metadata
    const enrichedTokens = useMemo(() => {
        return tokens.map((token, index) => ({
            token,
            tokenName: nameResults?.[index]?.result as string | undefined,
            tokenSymbol: symbolResults?.[index]?.result as string | undefined,
            reserveResult: reserveResults?.[index]?.result as [bigint, bigint] | undefined,
            isGraduated: graduatedResults?.[index]?.result as boolean | undefined,
        }))
    }, [tokens, nameResults, symbolResults, reserveResults, graduatedResults])

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
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map(({ token, tokenName, tokenSymbol, reserveResult, isGraduated }) => {
                const nativeReserve = reserveResult?.[0]
                const tokenReserve = reserveResult?.[1]

                let marketCap: string | undefined
                if (nativeReserve !== undefined && tokenReserve !== undefined) {
                    marketCap = calculateMarketCap(nativeReserve, tokenReserve, TOTAL_SUPPLY)
                }

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
            })}
        </div>
    )
}
