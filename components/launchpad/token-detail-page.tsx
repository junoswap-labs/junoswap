'use client'

import { formatEther } from 'viem'
import type { Address } from 'viem'
import { getGraduationMode } from '@/lib/launchpad-curve'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { useTokenReserves } from '@/hooks/useTokenReserves'
import { useGraduatedPoolPrice } from '@/hooks/useGraduatedPoolPrice'
import type { DailyMetrics } from '@/services/launchpad/chart'
import { useTokenList } from '@/hooks/useTokenList'
import { useGraduatedPoolAddress } from '@/hooks/useGraduatedPoolAddress'
import {
    getGraduatedPoolConfig,
    usesThirdPartyCurveUI,
    hasOwnGraduationUI,
} from '@/services/launchpad/platform-config'
import { formatAddress, formatTimeAgo, formatFullDate } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { TokenIcon } from '@/components/ui/token-icon'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { TokenTradeCard } from './token-trade-card'
import { DurianfunTradeCard } from './durianfun-trade-card'
import { TokenChartWrapper } from './token-chart-wrapper'
import { TokenStats } from './token-stats'
import { RecentTrades } from './recent-trades'
import { TokenHolders } from './token-holders'
import { GraduationProgress } from './graduation-progress'
import { DurianfunGraduationProgress } from './durianfun-graduation-progress'
import { ShareTokenDialog } from './share-token-dialog'
import { Globe, ArrowLeft, Copy, Check, Share2, Sprout, Facebook } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

interface TokenDetailPageProps {
    tokenAddr: Address
}

export function TokenDetailPage({ tokenAddr }: TokenDetailPageProps) {
    const chainId = useLaunchpadChainId()
    const { tokens: allTokens, snapshotMap } = useTokenList()
    const tokenInfo = allTokens.find((t) => t.address.toLowerCase() === tokenAddr.toLowerCase())
    const snapshotAthMarketCap = snapshotMap.get(tokenAddr.toLowerCase())?.athMarketCapNative

    const isGraduated = !!tokenInfo?.isGraduated
    const isDurianfun = tokenInfo?.platform === 'durianfun'
    const launchpadId = tokenInfo?.launchpadId
    // V1.1 caps buys at the graduation amount and graduates on a flat native reserve, so its
    // progress is measured against that amount rather than a solved-for threshold.
    const graduationMode = getGraduationMode(launchpadId)
    // Not-yet-graduated Durianfun tokens trade on their own per-token market contract, not
    // Junoswap's shared bonding curve — Junoswap's reserve/graduation reads don't apply to them.
    const isThirdPartyCurve = usesThirdPartyCurveUI(tokenInfo?.platform, isGraduated)

    const {
        nativeReserve,
        tokenReserve,
        virtualAmount,
        graduationAmount,
        isLoading: isLoadingReserves,
    } = useTokenReserves({
        // Durianfun tokens (graduated or not) never lived on Junoswap's own bonding curve
        // contract, so its reserve reads don't apply to them at any point.
        tokenAddr: isDurianfun ? null : tokenAddr,
        isGraduated,
        chainId,
        launchpadId,
    })

    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    const { poolAddress, isLoading: isPoolLoading } = useGraduatedPoolAddress(
        isGraduated ? tokenAddr : undefined,
        wrappedNative as Address | undefined,
        chainId,
        isGraduated ? tokenInfo?.ammPool : undefined
    )

    const { marketCap: liveGraduatedMarketCap } = useGraduatedPoolPrice({
        poolAddress,
        tokenAddr,
        wrappedNative: wrappedNative as Address | undefined,
        chainId,
        isGraduated,
    })

    const marketCap = useMemo(() => {
        if (isGraduated) {
            if (liveGraduatedMarketCap !== null) return String(liveGraduatedMarketCap)
            return snapshotMap.get(tokenAddr.toLowerCase())?.marketCapNative ?? '0'
        }
        // Third-party (Durianfun) non-graduated tokens don't use Junoswap's reserve reads —
        // useTokenList already computed marketCapNative for them from the on-chain fetch.
        if (isThirdPartyCurve) {
            return snapshotMap.get(tokenAddr.toLowerCase())?.marketCapNative ?? '0'
        }
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
        isThirdPartyCurve,
        tokenAddr,
        virtualAmount,
        nativeReserve,
        tokenReserve,
        snapshotMap,
        liveGraduatedMarketCap,
    ])

    const symbol = tokenInfo?.symbol || 'TOKEN'
    const name = tokenInfo?.name || 'Unknown Token'
    const decimals = 18
    const [copied, setCopied] = useState(false)
    const [shareOpen, setShareOpen] = useState(false)
    const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics | null>(null)

    // The indexer's TokenSnapshot aggregate freezes at graduation (stops syncing after the token
    // moves to a pool), so it can't be trusted for the true peak. The chart already replays every
    // swap the token ever had, so its own max is the real ATH -- fall back to the frozen snapshot
    // only while that history is still loading.
    const athMarketCap = useMemo(() => {
        if (dailyMetrics?.athMarketCap) return String(dailyMetrics.athMarketCap)
        const snapshotAth = snapshotAthMarketCap ? parseFloat(snapshotAthMarketCap) : 0
        const liveMcap = isGraduated ? (liveGraduatedMarketCap ?? parseFloat(marketCap)) : 0
        return String(Math.max(snapshotAth, liveMcap))
    }, [
        dailyMetrics?.athMarketCap,
        snapshotAthMarketCap,
        isGraduated,
        liveGraduatedMarketCap,
        marketCap,
    ])

    const priceChange1dPct =
        dailyMetrics?.priceChange1dPct ??
        snapshotMap.get(tokenAddr.toLowerCase())?.priceChange1dPct ??
        null

    const copyAddress = () => {
        navigator.clipboard.writeText(tokenAddr)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (isLoadingReserves) {
        return null
    }

    return (
        <div className="space-y-3 md:space-y-4 overflow-hidden">
            <Link
                href="/launchpad"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Launchpad
            </Link>

            <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12 items-start">
                <div className="order-2 min-w-0 space-y-3 md:space-y-4 lg:order-1 lg:col-span-8">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
                            <TokenIcon
                                src={tokenInfo?.logo}
                                symbol={symbol}
                                size="xl"
                                variant="square"
                            />
                            <div className="min-w-0">
                                <h1 className="truncate text-lg font-bold md:text-xl">{name}</h1>
                                <span className="text-sm text-muted-foreground">{symbol}</span>
                                {tokenInfo?.creator && (
                                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Link
                                            href={`/portfolio?address=${tokenInfo.creator}`}
                                            className="font-mono text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            {formatAddress(tokenInfo.creator)}
                                        </Link>
                                        {tokenInfo.createdTime > 0 && (
                                            <>
                                                <Sprout className="h-3 w-3 shrink-0" />
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className="cursor-default">
                                                            {formatTimeAgo(
                                                                tokenInfo.createdTime
                                                            ).replace(' ago', '')}
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {formatFullDate(tokenInfo.createdTime)}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                onClick={copyAddress}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 transition-colors hover:bg-muted sm:gap-2 sm:px-4"
                                title="Copy contract address"
                            >
                                <Copy className="h-3.5 w-3.5 text-muted-foreground/50 sm:hidden" />
                                {copied && (
                                    <Check className="h-3.5 w-3.5 text-positive sm:hidden" />
                                )}
                                <span className="font-mono text-xs text-muted-foreground">
                                    {formatAddress(tokenAddr)}
                                </span>
                                {copied ? (
                                    <Check className="hidden h-3.5 w-3.5 text-positive sm:block" />
                                ) : (
                                    <Copy className="hidden h-3.5 w-3.5 text-muted-foreground/50 sm:block" />
                                )}
                            </button>
                            <button
                                onClick={() => setShareOpen(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-muted-foreground transition-colors hover:bg-muted active:scale-95"
                                title="Share token"
                            >
                                <Share2 className="h-3.5 w-3.5" />
                                <span className="text-xs font-medium">Share</span>
                            </button>
                        </div>
                    </div>

                    <ShareTokenDialog
                        open={shareOpen}
                        onOpenChange={setShareOpen}
                        tokenAddr={tokenAddr}
                        symbol={symbol}
                        name={name}
                        logo={tokenInfo?.logo}
                        marketCap={marketCap}
                        priceChange1dPct={priceChange1dPct}
                        isGraduated={isGraduated}
                    />

                    <TokenStats
                        marketCap={marketCap}
                        symbol={symbol}
                        platform={tokenInfo?.platform}
                        isGraduated={isGraduated}
                        athMarketCap={athMarketCap}
                        priceChange1dPct={priceChange1dPct}
                        feeBreakdown={dailyMetrics?.feeBreakdown ?? null}
                    />

                    <TokenChartWrapper
                        tokenAddr={tokenAddr}
                        nativeReserve={nativeReserve}
                        tokenReserve={tokenReserve}
                        virtualAmount={virtualAmount}
                        isGraduated={isGraduated}
                        poolAddress={poolAddress}
                        graduatedAt={tokenInfo?.graduatedAt ?? null}
                        creatorAddress={tokenInfo?.creator}
                        onDailyMetricsChange={setDailyMetrics}
                        market={tokenInfo?.market}
                        platform={tokenInfo?.platform}
                    />

                    {(tokenInfo?.description ||
                        tokenInfo?.link1 ||
                        tokenInfo?.link2 ||
                        tokenInfo?.link3 ||
                        tokenInfo?.link4) && (
                        <div className="rounded-xl border bg-card p-4">
                            <h3 className="mb-2 text-sm font-semibold">About {symbol}</h3>
                            {tokenInfo?.description && (
                                <p className="text-sm text-muted-foreground break-words min-w-0">
                                    {tokenInfo.description}
                                </p>
                            )}
                            {(tokenInfo?.link1 ||
                                tokenInfo?.link2 ||
                                tokenInfo?.link3 ||
                                tokenInfo?.link4) && (
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
                                    {tokenInfo?.link4 && (
                                        <a
                                            href={tokenInfo.link4}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Badge
                                                variant="secondary"
                                                className="gap-1.5 rounded-lg px-4 py-2 font-normal hover:bg-secondary/80"
                                            >
                                                <Facebook className="h-3.5 w-3.5" />
                                                Facebook
                                            </Badge>
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <RecentTrades
                        tokenAddr={tokenAddr}
                        tokenSymbol={symbol}
                        poolAddress={poolAddress}
                        isGraduated={isGraduated}
                        creatorAddress={tokenInfo?.creator}
                        market={tokenInfo?.market}
                        platform={tokenInfo?.platform}
                    />
                </div>

                <div className="order-1 min-w-0 lg:order-2 lg:col-span-4">
                    <div className="space-y-3 md:space-y-4 lg:sticky lg:top-20">
                        {isThirdPartyCurve && tokenInfo?.market ? (
                            <DurianfunTradeCard
                                tokenAddr={tokenAddr}
                                tokenSymbol={symbol}
                                tokenLogo={tokenInfo.logo}
                                marketAddr={tokenInfo.market}
                                chainId={chainId}
                            />
                        ) : (
                            <TokenTradeCard
                                tokenAddr={tokenAddr}
                                tokenSymbol={symbol}
                                tokenLogo={tokenInfo?.logo}
                                tokenDecimals={decimals}
                                isGraduated={isGraduated}
                                poolAddress={poolAddress}
                                poolFee={
                                    isGraduated
                                        ? getGraduatedPoolConfig(tokenInfo?.platform).poolFee
                                        : undefined
                                }
                                isPoolLoading={isPoolLoading}
                                launchpadId={launchpadId}
                                dexId={
                                    isGraduated
                                        ? getGraduatedPoolConfig(tokenInfo?.platform).dexId
                                        : undefined
                                }
                            />
                        )}
                        {!hasOwnGraduationUI(tokenInfo?.platform) &&
                            nativeReserve !== undefined &&
                            graduationAmount !== undefined && (
                                <Card>
                                    <CardContent className="p-4">
                                        <h4 className="mb-2 text-sm font-semibold">
                                            Bonding Curve
                                        </h4>
                                        <GraduationProgress
                                            nativeReserve={nativeReserve}
                                            tokenReserve={tokenReserve}
                                            graduationAmount={graduationAmount}
                                            virtualAmount={virtualAmount}
                                            isGraduated={!!isGraduated}
                                            graduationMode={graduationMode}
                                        />
                                    </CardContent>
                                </Card>
                            )}
                        {hasOwnGraduationUI(tokenInfo?.platform) && tokenInfo?.market && (
                            <DurianfunGraduationProgress
                                marketAddr={tokenInfo.market}
                                chainId={chainId}
                                isGraduated={isGraduated}
                            />
                        )}
                        <div className="hidden lg:block">
                            <TokenHolders
                                tokenAddr={tokenAddr}
                                creator={tokenInfo?.creator}
                                poolAddress={poolAddress}
                                isGraduated={isGraduated}
                                market={tokenInfo?.market}
                                platform={tokenInfo?.platform}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="lg:hidden">
                <TokenHolders
                    tokenAddr={tokenAddr}
                    creator={tokenInfo?.creator}
                    poolAddress={poolAddress}
                    isGraduated={isGraduated}
                    market={tokenInfo?.market}
                    platform={tokenInfo?.platform}
                />
            </div>
        </div>
    )
}
