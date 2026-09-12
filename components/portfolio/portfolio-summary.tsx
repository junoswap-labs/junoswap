'use client'

import { Card, CardContent } from '@/components/ui/card'
import { NetWorthChart } from '@/components/portfolio/net-worth-chart'
import type { PortfolioSummary } from '@/types/portfolio'
import type { NetWorthPoint } from '@/services/portfolio/net-worth'
import { cn } from '@/lib/utils'

interface PortfolioSummaryProps {
    summary: PortfolioSummary
    history: NetWorthPoint[]
    isLoading: boolean
    isHistoryLoading: boolean
}

function formatUsd(value: number): string {
    if (value >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(2)}M`
    }
    if (value >= 1_000) {
        return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `$${value.toFixed(2)}`
}

function formatPnl(value: number): string {
    const sign = value >= 0 ? '+' : '-'
    const abs = Math.abs(value)
    if (abs >= 1_000_000) {
        return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
    }
    if (abs >= 1_000) {
        return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `${sign}$${abs.toFixed(2)}`
}

export function PortfolioSummary({
    summary,
    history,
    isLoading,
    isHistoryLoading,
}: PortfolioSummaryProps) {
    const isPositive = (summary.totalPnl ?? 0) >= 0
    const hasChart = history.length >= 2

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6">
                <div className="space-y-1.5">
                    {isLoading ? (
                        <div className="h-10 w-48 animate-pulse rounded-md bg-muted/30" />
                    ) : (
                        <div className="text-4xl font-bold font-mono tracking-tight">
                            {formatUsd(summary.netWorth)}
                        </div>
                    )}
                    <div className="flex items-baseline gap-2 pt-0.5">
                        {isLoading || isHistoryLoading ? (
                            <div className="h-5 w-32 animate-pulse rounded-md bg-muted/30" />
                        ) : summary.totalPnl === null ? (
                            <span className="font-mono text-sm font-semibold text-muted-foreground">
                                --
                            </span>
                        ) : (
                            <span
                                className={cn(
                                    'font-mono text-sm font-semibold',
                                    isPositive ? 'text-positive' : 'text-negative'
                                )}
                            >
                                {formatPnl(summary.totalPnl)}
                            </span>
                        )}
                        <span className="text-xs font-medium text-muted-foreground">Total PNL</span>
                    </div>
                </div>

                {isHistoryLoading ? (
                    <div className="mt-6 h-[120px] w-full animate-pulse rounded-md bg-muted/20" />
                ) : (
                    hasChart && (
                        <div className="mt-6 animate-in fade-in duration-500">
                            <NetWorthChart data={history} />
                        </div>
                    )
                )}
            </CardContent>
        </Card>
    )
}
