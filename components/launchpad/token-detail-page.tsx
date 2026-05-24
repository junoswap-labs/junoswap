'use client'

import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import { formatEther } from 'viem'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { useTokenReserves } from '@/hooks/useTokenReserves'
import { useTokenList } from '@/hooks/useTokenList'
import { useTokenPrice } from '@/hooks/useTokenPrice'
import { cn } from '@/lib/utils'
import { ExplorerLink } from '@/components/ui/explorer-link'
import { TokenTradeCard } from './token-trade-card'
import { TokenChartWrapper } from './token-chart-wrapper'
import { TokenStats } from './token-stats'
import { RecentTrades } from './recent-trades'
import { TokenHolders } from './token-holders'
import { TokenDetailSkeleton } from './token-detail-skeleton'
import { Globe, Twitter, MessageCircle, ArrowLeft, Copy, Check } from 'lucide-react'
import { useNativeUsdPriceContext } from './native-usd-price-provider'
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
        virtualAmount,
        isGraduated,
        graduationAmount,
        isLoading: isLoadingReserves,
    } = useTokenReserves({ tokenAddr })

    // Get creation event data for this token
    const { tokens: allTokens } = useTokenList()
    const tokenInfo = allTokens.find((t) => t.address.toLowerCase() === tokenAddr.toLowerCase())

    // Token price
    const { currentPrice, priceChangePercent24h, isPositive } = useTokenPrice(tokenAddr)

    const marketCap =
        virtualAmount > 0n && nativeReserve > 0n && tokenReserve > 0n
            ? String(
                  (parseFloat(formatEther(virtualAmount + nativeReserve)) /
                      parseFloat(formatEther(tokenReserve))) *
                      1e9
              )
            : '0'

    const symbol = (tokenSymbol as string) || 'TOKEN'
    const name = (tokenName as string) || 'Unknown Token'
    const decimals = (tokenDecimals as number) || 18

    const [copied, setCopied] = useState(false)
    const { nativeUsdPrice } = useNativeUsdPriceContext()
    const displayPrice =
        nativeUsdPrice !== null && currentPrice !== null
            ? currentPrice * nativeUsdPrice
            : currentPrice

    const copyAddress = () => {
        navigator.clipboard.writeText(tokenAddr)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (isLoadingReserves) {
        return <TokenDetailSkeleton />
    }

    return (
        <div className="space-y-3 md:space-y-4 overflow-hidden">
            {/* Back button */}
            <Link
                href="/launchpad"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Launchpad
            </Link>

            {/* Two-column grid */}
            <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
                {/* Left column — token info, chart, stats, trades */}
                <div className="order-2 min-w-0 space-y-3 md:space-y-4 lg:order-1 lg:col-span-8">
                    {/* Price header */}
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5 md:gap-x-6 md:gap-y-2">
                        {/* Token identity */}
                        <div className="flex items-center gap-2.5 md:gap-3">
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
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
                                <div className="mt-0.5 flex items-center gap-1.5">
                                    <ExplorerLink
                                        value={tokenAddr}
                                        type="token"
                                        chainId={PUMP_CORE_NATIVE_CHAIN_ID}
                                        className="text-xs"
                                    />
                                    <button
                                        onClick={copyAddress}
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                        title="Copy address"
                                    >
                                        {copied ? (
                                            <Check className="h-3 w-3 text-green-400" />
                                        ) : (
                                            <Copy className="h-3 w-3" />
                                        )}
                                    </button>
                                </div>
                                {tokenInfo?.description && (
                                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground break-words min-w-0">
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
                            {displayPrice !== null ? (
                                <span className="text-2xl font-bold tabular-nums tracking-tight md:text-3xl">
                                    {nativeUsdPrice !== null ? '$' : ''}
                                    {displayPrice < 0.0001
                                        ? '<0.0001'
                                        : displayPrice < 1
                                          ? displayPrice.toFixed(6)
                                          : displayPrice.toFixed(4)}
                                    {nativeUsdPrice === null ? ' KUB' : ''}
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
                    <TokenChartWrapper
                        tokenAddr={tokenAddr}
                        nativeReserve={nativeReserve}
                        tokenReserve={tokenReserve}
                        virtualAmount={virtualAmount}
                    />

                    {/* Recent trades */}
                    <RecentTrades tokenAddr={tokenAddr} tokenSymbol={symbol} />
                </div>

                {/* Right column — trade panel + holders */}
                <div className="order-1 min-w-0 lg:order-2 lg:col-span-4">
                    <div className="space-y-3 md:space-y-4 lg:sticky lg:top-20">
                        <TokenTradeCard
                            tokenAddr={tokenAddr}
                            tokenSymbol={symbol}
                            tokenDecimals={decimals}
                            isGraduated={isGraduated}
                        />
                        <div className="hidden lg:block">
                            <TokenHolders tokenAddr={tokenAddr} creator={tokenInfo?.creator} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Holders — full width at bottom on mobile/tablet */}
            <div className="lg:hidden">
                <TokenHolders tokenAddr={tokenAddr} creator={tokenInfo?.creator} />
            </div>
        </div>
    )
}
