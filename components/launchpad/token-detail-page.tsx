'use client'

import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import { formatEther } from 'viem'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { getV3Config } from '@/lib/dex-config'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { useTokenReserves } from '@/hooks/useTokenReserves'
import { useTokenList } from '@/hooks/useTokenList'
import { formatAddress, formatTimeAgo } from '@/lib/utils'
import { ExplorerLink } from '@/components/ui/explorer-link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { TokenTradeCard } from './token-trade-card'
import { TokenChartWrapper } from './token-chart-wrapper'
import { TokenStats } from './token-stats'
import { RecentTrades } from './recent-trades'
import { TokenHolders } from './token-holders'
import { TokenDetailSkeleton } from './token-detail-skeleton'
import { GraduationProgress } from './graduation-progress'
import { Globe, ArrowLeft, Copy, Check } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

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
    const { tokens: allTokens, snapshotMap } = useTokenList()
    const tokenInfo = allTokens.find((t) => t.address.toLowerCase() === tokenAddr.toLowerCase())
    const athMarketCap = snapshotMap.get(tokenAddr.toLowerCase())?.athMarketCapNative

    // Resolve V3 pool address for graduated tokens
    const v3Config = getV3Config(PUMP_CORE_NATIVE_CHAIN_ID)
    const wrappedNative = INTERMEDIARY_TOKENS[PUMP_CORE_NATIVE_CHAIN_ID]?.wrappedNative

    const { data: poolAddressData } = useReadContract({
        address: v3Config!.factory as Address,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: 'getPool' as const,
        args: tokenAddr && wrappedNative ? [tokenAddr, wrappedNative as Address, 10000] : undefined,
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        query: { enabled: !!isGraduated && !!tokenAddr && !!wrappedNative },
    })

    const poolAddress =
        poolAddressData && poolAddressData !== '0x0000000000000000000000000000000000000000'
            ? (poolAddressData as Address)
            : undefined

    // Read V3 pool slot0 for graduated tokens
    const { data: slot0 } = useReadContract({
        address: poolAddress,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'slot0' as const,
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        query: { enabled: !!isGraduated && !!poolAddress },
    })

    const marketCap = useMemo(() => {
        if (isGraduated && poolAddress && slot0 && wrappedNative) {
            const sqrtPriceX96 = (
                slot0 as [bigint, number, number, number, number, number, boolean]
            )[0]
            if (sqrtPriceX96 > 0n) {
                const Q96 = 2n ** 96n
                const tokenIsToken0 = tokenAddr.toLowerCase() < wrappedNative.toLowerCase()
                let priceRaw: bigint
                if (tokenIsToken0) {
                    priceRaw = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / (Q96 * Q96)
                } else {
                    priceRaw = (Q96 * Q96 * 10n ** 18n) / (sqrtPriceX96 * sqrtPriceX96)
                }
                const priceNative = Number(priceRaw) / 1e18
                return String(priceNative * 1e9)
            }
        }
        // Fallback to bonding curve mcap
        if (virtualAmount > 0n && nativeReserve > 0n && tokenReserve > 0n) {
            return String(
                (parseFloat(formatEther(virtualAmount + nativeReserve)) /
                    parseFloat(formatEther(tokenReserve))) *
                    1e9
            )
        }
        return '0'
    }, [
        isGraduated,
        poolAddress,
        slot0,
        wrappedNative,
        tokenAddr,
        virtualAmount,
        nativeReserve,
        tokenReserve,
    ])

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
                    <div className="flex items-start justify-between gap-4">
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
                                <div>
                                    <h1 className="text-lg font-bold md:text-xl">{name}</h1>
                                    <span className="text-sm text-muted-foreground">{symbol}</span>
                                    {tokenInfo?.creator && (
                                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <ExplorerLink
                                                value={tokenInfo.creator}
                                                type="address"
                                                chainId={PUMP_CORE_NATIVE_CHAIN_ID}
                                                className="font-mono text-xs text-muted-foreground hover:text-foreground"
                                            />
                                            {tokenInfo.createdTime > 0 && (
                                                <>
                                                    <span>·</span>
                                                    <span>
                                                        {formatTimeAgo(tokenInfo.createdTime)}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* CA badge — right side */}
                        <button
                            onClick={copyAddress}
                            className="inline-flex items-center gap-2 rounded-lg bg-muted/60 px-4 py-2 transition-colors hover:bg-muted shrink-0"
                            title="Copy contract address"
                        >
                            <span className="font-mono text-xs text-muted-foreground">
                                {formatAddress(tokenAddr)}
                            </span>
                            {copied ? (
                                <Check className="h-3.5 w-3.5 text-green-400" />
                            ) : (
                                <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />
                            )}
                        </button>
                    </div>

                    {/* Inline market stats */}
                    <TokenStats
                        marketCap={marketCap}
                        isGraduated={isGraduated}
                        athMarketCap={athMarketCap}
                    />

                    {/* Chart */}
                    <TokenChartWrapper
                        tokenAddr={tokenAddr}
                        nativeReserve={nativeReserve}
                        tokenReserve={tokenReserve}
                        virtualAmount={virtualAmount}
                        isGraduated={isGraduated}
                        poolAddress={poolAddress}
                        graduatedAt={tokenInfo?.graduatedAt ?? null}
                    />

                    {/* About token */}
                    {(tokenInfo?.description ||
                        tokenInfo?.link1 ||
                        tokenInfo?.link2 ||
                        tokenInfo?.link3) && (
                        <div className="rounded-xl border bg-card p-4">
                            <h3 className="mb-2 text-sm font-semibold">About {symbol}</h3>
                            {tokenInfo?.description && (
                                <p className="text-sm text-muted-foreground break-words min-w-0">
                                    {tokenInfo.description}
                                </p>
                            )}
                            {(tokenInfo?.link1 || tokenInfo?.link2 || tokenInfo?.link3) && (
                                <div className="mt-3 flex gap-2">
                                    {tokenInfo?.link1 && (
                                        <a
                                            href={tokenInfo.link1}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Badge
                                                variant="secondary"
                                                className="gap-1.5 rounded-lg px-4 py-2 font-normal hover:bg-secondary/80"
                                            >
                                                <Globe className="h-3.5 w-3.5" />
                                                Website
                                            </Badge>
                                        </a>
                                    )}
                                    {tokenInfo?.link2 && (
                                        <a
                                            href={tokenInfo.link2}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Badge
                                                variant="secondary"
                                                className="gap-1.5 rounded-lg px-4 py-2 font-normal hover:bg-secondary/80"
                                            >
                                                <svg
                                                    className="h-3.5 w-3.5"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                >
                                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                                </svg>
                                                X
                                            </Badge>
                                        </a>
                                    )}
                                    {tokenInfo?.link3 && (
                                        <a
                                            href={tokenInfo.link3}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Badge
                                                variant="secondary"
                                                className="gap-1.5 rounded-lg px-4 py-2 font-normal hover:bg-secondary/80"
                                            >
                                                <svg
                                                    className="h-3.5 w-3.5"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                >
                                                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                                                </svg>
                                                Telegram
                                            </Badge>
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

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
                        {!isGraduated &&
                            nativeReserve !== undefined &&
                            graduationAmount !== undefined && (
                                <Card>
                                    <CardContent className="p-4">
                                        <h4 className="mb-2 text-sm font-semibold">
                                            Bonding Curve
                                        </h4>
                                        <GraduationProgress
                                            nativeReserve={nativeReserve}
                                            graduationAmount={graduationAmount}
                                            isGraduated={false}
                                        />
                                    </CardContent>
                                </Card>
                            )}
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
