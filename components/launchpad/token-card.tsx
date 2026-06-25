'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { TokenIcon } from '@/components/ui/token-icon'
import { formatAddress, formatTimeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { formatCompact } from '@/services/launchpad'
import type { LaunchToken } from '@/types/launchpad'
import { useNativeUsdPriceContext } from './native-usd-price-provider'

interface TokenCardProps {
    token: LaunchToken
    tokenName?: string
    tokenSymbol?: string
    marketCap?: string
    athMarketCap?: string
    isGraduated?: boolean
    priceChange1dPct?: number | null
}

export function TokenCard({
    token,
    tokenName,
    tokenSymbol,
    marketCap,
    athMarketCap,
    isGraduated,
    priceChange1dPct,
}: TokenCardProps) {
    const { nativeUsdPrice } = useNativeUsdPriceContext()
    const symbol = tokenSymbol || token.symbol || '???'
    const name = tokenName || token.name || ''

    return (
        <Link href={`/launchpad/token/${token.address}`} className="group relative block">
            <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-primary to-[#FF914D] opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-40" />
            <Card className="relative transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1">
                <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                    <TokenIcon
                        src={token.logo}
                        symbol={symbol}
                        size="xl"
                        variant="square"
                        className="h-24 w-24 lg:h-[120px] lg:w-[120px]"
                    />

                    <div className="min-w-0 flex-1 py-0.5">
                        <p className="truncate text-lg font-bold leading-tight">
                            {symbol}
                            {name && (
                                <span className="ml-1.5 font-normal text-muted-foreground">
                                    {name}
                                </span>
                            )}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {formatAddress(token.creator)} · {formatTimeAgo(token.createdTime)}
                        </p>

                        {(marketCap || (athMarketCap && parseFloat(athMarketCap) > 0)) && (
                            <div className="mb-1.5 mt-3 flex items-center justify-between text-sm">
                                {marketCap && (
                                    <span className="font-medium">
                                        MC{' '}
                                        {nativeUsdPrice !== null
                                            ? `$${formatCompact(parseFloat(marketCap) * nativeUsdPrice)}`
                                            : `${formatCompact(parseFloat(marketCap))} KUB`}
                                        {priceChange1dPct != null && (
                                            <span
                                                className={cn(
                                                    'ml-1.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                                                    priceChange1dPct >= 0
                                                        ? 'bg-positive/15 text-positive'
                                                        : 'bg-negative/15 text-negative'
                                                )}
                                            >
                                                {priceChange1dPct >= 0 ? '+' : ''}
                                                {priceChange1dPct.toFixed(2)}%
                                            </span>
                                        )}
                                    </span>
                                )}
                                {athMarketCap && parseFloat(athMarketCap) > 0 && (
                                    <span className="font-medium text-muted-foreground">
                                        ATH{' '}
                                        {nativeUsdPrice !== null
                                            ? `$${formatCompact(parseFloat(athMarketCap) * nativeUsdPrice)}`
                                            : `${formatCompact(parseFloat(athMarketCap))} KUB`}
                                    </span>
                                )}
                            </div>
                        )}
                        {athMarketCap &&
                            parseFloat(athMarketCap) > 0 &&
                            marketCap &&
                            (() => {
                                const progress = Math.min(
                                    (parseFloat(marketCap) / parseFloat(athMarketCap)) * 100,
                                    100
                                )
                                return (
                                    <div className="space-y-1">
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                            <div
                                                className="h-full rounded-full transition-all duration-300"
                                                style={{
                                                    width: `${progress}%`,
                                                    background:
                                                        'linear-gradient(90deg, rgb(30 215 96 / 0.3), rgb(30 215 96))',
                                                }}
                                            />
                                        </div>
                                        {isGraduated && (
                                            <span className="text-xs text-positive font-medium">
                                                Graduated
                                            </span>
                                        )}
                                    </div>
                                )
                            })()}
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
