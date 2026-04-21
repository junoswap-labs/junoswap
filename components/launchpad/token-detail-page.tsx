'use client'

import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import { parseEther } from 'viem'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { useTokenReserves } from '@/hooks/useTokenReserves'
import { useTokenList } from '@/hooks/useTokenList'
import { useTokenPrice } from '@/hooks/useTokenPrice'
import { calculateMarketCap } from '@/services/launchpad'
import { formatAddress, cn } from '@/lib/utils'
import { TokenTradeCard } from './token-trade-card'
import { TokenChartWrapper } from './token-chart-wrapper'
import { TokenStats } from './token-stats'
import { RecentTrades } from './recent-trades'
import { TokenHolders } from './token-holders'
import { TokenDetailSkeleton } from './token-detail-skeleton'
import { Globe, Twitter, MessageCircle, ArrowLeft, Copy, Check } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

interface TokenDetailPageProps {
    tokenAddr: Address
}

export function TokenDetailPage({ tokenAddr }: TokenDetailPageProps) {
    // Read ERC20 metadata
    const { data: tokenName } = useReadContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: 'name',
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
    })

    const { data: tokenSymbol } = useReadContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: 'symbol',
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
    })

    const { data: tokenDecimals } = useReadContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: 'decimals',
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
    })

    // Read reserves
    const {
        nativeReserve,
        tokenReserve,
        isGraduated,
        graduationAmount,
        isLoading: isLoadingReserves,
    } = useTokenReserves({ tokenAddr })

    // Get creation event data for this token
    const { tokens: allTokens } = useTokenList()
    const tokenInfo = allTokens.find((t) => t.address.toLowerCase() === tokenAddr.toLowerCase())

    // Token price
    const { currentPrice, priceChangePercent24h, isPositive } = useTokenPrice(tokenAddr)

    const totalSupply = parseEther('1000000000') // 1 billion with 18 decimals
    const marketCap = calculateMarketCap(nativeReserve, tokenReserve, totalSupply)

    const symbol = (tokenSymbol as string) || 'TOKEN'
    const name = (tokenName as string) || 'Unknown Token'
    const decimals = (tokenDecimals as number) || 18

    const [copied, setCopied] = useState(false)

    const copyAddress = () => {
        navigator.clipboard.writeText(tokenAddr)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (isLoadingReserves) {
        return <TokenDetailSkeleton />
    }

    return (
        <div className="space-y-3 md:space-y-4">
            {/* Back button */}
            <Link
                href="/launchpad"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Launchpad
            </Link>

            {/* Two-column grid */}
            <div className="grid gap-4 md:gap-6 lg:grid-cols-12">
                {/* Left column — token info, chart, stats, trades */}
                <div className="order-2 space-y-3 md:space-y-4 lg:order-1 lg:col-span-8">
                    {/* Price header */}
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5 md:gap-x-6 md:gap-y-2">
                        {/* Token identity */}
                        <div className="flex items-center gap-2.5 md:gap-3">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted md:h-14 md:w-14">
                                {tokenInfo?.logo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={tokenInfo.logo}
                                        alt={symbol}
                                        className="h-full w-full object-cover"
                                        onError={(e) => {
                                            ;(e.target as HTMLImageElement).style.display = 'none'
                                        }}
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-base font-bold text-muted-foreground">
                                        {symbol.slice(0, 2)}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                                    <h1 className="text-lg font-bold md:text-xl">{name}</h1>
                                    <span className="text-sm text-muted-foreground">${symbol}</span>
                                </div>
                                <button
                                    onClick={copyAddress}
                                    className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <span className="font-mono">{formatAddress(tokenAddr)}</span>
                                    {copied ? (
                                        <Check className="h-3 w-3 text-green-400" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </button>
                                {tokenInfo?.description && (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {tokenInfo.description}
                                    </p>
                                )}
                                {(tokenInfo?.link1 || tokenInfo?.link2 || tokenInfo?.link3) && (
                                    <div className="mt-1 flex gap-2">
                                        {tokenInfo?.link1 && (
                                            <a
                                                href={tokenInfo.link1}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            >
                                                <Globe className="h-4 w-4" />
                                            </a>
                                        )}
                                        {tokenInfo?.link2 && (
                                            <a
                                                href={tokenInfo.link2}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            >
                                                <Twitter className="h-4 w-4" />
                                            </a>
                                        )}
                                        {tokenInfo?.link3 && (
                                            <a
                                                href={tokenInfo.link3}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            >
                                                <MessageCircle className="h-4 w-4" />
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Price display */}
                        <div className="flex items-baseline gap-2 md:gap-3">
                            {currentPrice !== null ? (
                                <span className="text-2xl font-bold tabular-nums tracking-tight md:text-3xl">
                                    {currentPrice < 0.0001
                                        ? '<0.0001'
                                        : currentPrice < 1
                                          ? currentPrice.toFixed(6)
                                          : currentPrice.toFixed(4)}{' '}
                                    KUB
                                </span>
                            ) : (
                                <span className="text-2xl font-bold text-muted-foreground md:text-3xl">
                                    --
                                </span>
                            )}
                            {priceChangePercent24h !== null && (
                                <span
                                    className={cn(
                                        'inline-flex items-center rounded-md px-1.5 py-0.5 text-sm font-semibold tabular-nums',
                                        isPositive
                                            ? 'bg-emerald-500/15 text-emerald-400'
                                            : 'bg-red-500/15 text-red-400'
                                    )}
                                >
                                    {isPositive ? '+' : ''}
                                    {priceChangePercent24h.toFixed(2)}%
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Inline market stats */}
                    <TokenStats
                        marketCap={marketCap}
                        nativeReserve={nativeReserve}
                        tokenReserve={tokenReserve}
                        tokenSymbol={symbol}
                        isGraduated={isGraduated}
                        graduationAmount={graduationAmount}
                    />

                    {/* Chart */}
                    <TokenChartWrapper tokenAddr={tokenAddr} />

                    {/* Recent trades */}
                    <RecentTrades tokenAddr={tokenAddr} tokenSymbol={symbol} />
                </div>

                {/* Right column — trade panel + holders */}
                <div className="order-1 lg:order-2 lg:col-span-4">
                    <div className="space-y-3 md:space-y-4 lg:sticky lg:top-20">
                        <TokenTradeCard
                            tokenAddr={tokenAddr}
                            tokenSymbol={symbol}
                            tokenDecimals={decimals}
                            isGraduated={isGraduated}
                        />
                        <div className="hidden lg:block">
                            <TokenHolders tokenAddr={tokenAddr} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Holders — full width at bottom on mobile/tablet */}
            <div className="lg:hidden">
                <TokenHolders tokenAddr={tokenAddr} />
            </div>
        </div>
    )
}
