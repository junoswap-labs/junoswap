'use client'

import { cn } from '@/lib/utils'
import {
    formatKub,
    calculateGraduationProgress,
    formatCompact,
    isReadyToGraduate,
} from '@/services/launchpad'
import { useNativeUsdPriceContext } from './native-usd-price-provider'

interface TokenStatsProps {
    marketCap: string
    nativeReserve: bigint
    isGraduated: boolean
    graduationAmount: bigint
    className?: string
}

export function TokenStats({
    marketCap,
    nativeReserve,
    isGraduated,
    graduationAmount,
    className,
}: TokenStatsProps) {
    const progress = calculateGraduationProgress(nativeReserve, graduationAmount)
    const ready = isReadyToGraduate(nativeReserve, graduationAmount, isGraduated)
    const { nativeUsdPrice } = useNativeUsdPriceContext()
    const mcapNum = parseFloat(marketCap)
    const displayMcap = nativeUsdPrice !== null ? mcapNum * nativeUsdPrice : mcapNum

    return (
        <div className={cn('flex items-center justify-between gap-6', className)}>
            {/* Left — mcap */}
            <div className="shrink-0">
                <div className="text-2xl font-bold tabular-nums tracking-tight md:text-3xl">
                    {nativeUsdPrice !== null
                        ? `$${formatCompact(displayMcap)}`
                        : `${formatCompact(displayMcap)} KUB`}
                </div>
                <div className="text-xs text-muted-foreground uppercase">mcap</div>
            </div>

            {/* Right — progress bar */}
            {isGraduated ? (
                <div className="w-1/3 text-sm font-semibold text-emerald-400">Graduated</div>
            ) : graduationAmount > 0n ? (
                <div className="w-1/3 space-y-1.5">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                                width: `${Math.min(progress, 100)}%`,
                                background: ready
                                    ? 'linear-gradient(90deg, rgb(245 158 11 / 0.3), rgb(245 158 11))'
                                    : `linear-gradient(90deg, hsl(var(--primary) / 0.3), hsl(var(--primary)))`,
                            }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                            {formatKub(nativeReserve)} / {formatKub(graduationAmount)} KUB
                        </span>
                        <span>{ready ? '100%' : `${progress.toFixed(1)}%`}</span>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
