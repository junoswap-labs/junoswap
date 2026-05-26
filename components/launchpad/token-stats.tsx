'use client'

import { cn } from '@/lib/utils'
import { formatCompact } from '@/services/launchpad'
import { useNativeUsdPriceContext } from './native-usd-price-provider'

interface TokenStatsProps {
    marketCap: string
    isGraduated?: boolean
    athMarketCap?: string
    priceChange1dPct?: number | null
    className?: string
}

export function TokenStats({
    marketCap,
    athMarketCap,
    priceChange1dPct,
    className,
}: TokenStatsProps) {
    const { nativeUsdPrice } = useNativeUsdPriceContext()
    const mcapNum = parseFloat(marketCap)
    const displayMcap = nativeUsdPrice !== null ? mcapNum * nativeUsdPrice : mcapNum
    const athNum = athMarketCap ? parseFloat(athMarketCap) : 0

    return (
        <div className={cn('flex items-center justify-between gap-6', className)}>
            {/* Left — mcap */}
            <div className="shrink-0">
                <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold tabular-nums tracking-tight md:text-3xl">
                        {nativeUsdPrice !== null
                            ? `$${formatCompact(displayMcap)}`
                            : `${formatCompact(displayMcap)} KUB`}
                    </div>
                    {priceChange1dPct != null && (
                        <span
                            className={cn(
                                'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                                priceChange1dPct >= 0
                                    ? 'bg-emerald-500/15 text-emerald-500'
                                    : 'bg-red-500/15 text-red-500'
                            )}
                        >
                            {priceChange1dPct >= 0 ? '+' : ''}
                            {priceChange1dPct.toFixed(2)}%
                        </span>
                    )}
                </div>
                <div className="text-xs text-muted-foreground uppercase">mcap</div>
            </div>

            {/* Right — ATH progress bar */}
            {athNum > 0 ? (
                <div className="w-1/3 space-y-1.5">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                                width: `${Math.min((mcapNum / athNum) * 100, 100)}%`,
                                background:
                                    'linear-gradient(90deg, rgb(34 197 94 / 0.3), rgb(34 197 94))',
                            }}
                        />
                    </div>
                    <div className="flex justify-end text-xs text-muted-foreground">
                        <span>
                            ATH{' '}
                            {nativeUsdPrice !== null
                                ? `$${formatCompact(athNum * nativeUsdPrice)}`
                                : `${formatCompact(athNum)} KUB`}
                        </span>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
