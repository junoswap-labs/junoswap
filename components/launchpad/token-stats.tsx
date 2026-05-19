'use client'

import { cn } from '@/lib/utils'
import {
    formatKub,
    formatTokenAmount,
    calculateGraduationProgress,
    formatCompact,
    isReadyToGraduate,
} from '@/services/launchpad'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useNativeUsdPriceContext } from './native-usd-price-provider'

interface TokenStatsProps {
    marketCap: string
    nativeReserve: bigint
    tokenReserve: bigint
    tokenSymbol: string
    isGraduated: boolean
    graduationAmount: bigint
    className?: string
}

function StatItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                {label}
            </span>
            <span className="text-sm font-bold tabular-nums">{value}</span>
        </div>
    )
}

export function TokenStats({
    marketCap,
    nativeReserve,
    tokenReserve,
    tokenSymbol,
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
        <div className={cn('space-y-3', className)}>
            {/* Stats row */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:gap-6">
                <StatItem
                    label="Market Cap"
                    value={
                        nativeUsdPrice !== null
                            ? `$${formatCompact(displayMcap)}`
                            : `${formatCompact(displayMcap)} KUB`
                    }
                />
                <Separator orientation="vertical" className="h-8" />
                <StatItem label="KUB Reserve" value={`${formatKub(nativeReserve)} KUB`} />
                <Separator orientation="vertical" className="h-8" />
                <StatItem
                    label="Token Reserve"
                    value={`${formatTokenAmount(tokenReserve)} ${tokenSymbol}`}
                />
                <Separator orientation="vertical" className="h-8" />
                <div className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                        Status
                    </span>
                    {isGraduated ? (
                        <Badge variant="default" className="w-fit bg-green-600 text-white text-xs">
                            Graduated
                        </Badge>
                    ) : ready ? (
                        <Badge variant="default" className="w-fit bg-amber-500 text-white text-xs">
                            Ready to Graduate
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="w-fit text-xs">
                            Bonding Curve
                        </Badge>
                    )}
                </div>
            </div>

            {/* Graduation progress */}
            {!isGraduated && graduationAmount > 0n && (
                <div className="space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                            className={cn(
                                'h-full rounded-full transition-all duration-300',
                                ready ? 'bg-amber-500' : 'bg-primary'
                            )}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                            {formatKub(nativeReserve)} / {formatKub(graduationAmount)} KUB
                        </span>
                        <span>
                            {ready
                                ? '100% — Ready to Graduate'
                                : `${progress.toFixed(1)}% to graduation`}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
