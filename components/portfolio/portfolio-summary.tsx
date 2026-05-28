'use client'

import { Card, CardContent } from '@/components/ui/card'
import type { PortfolioSummary } from '@/types/portfolio'
import { cn } from '@/lib/utils'

interface PortfolioSummaryProps {
    summary: PortfolioSummary
    isLoading: boolean
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

export function PortfolioSummary({ summary, isLoading }: PortfolioSummaryProps) {
    const isPositive = (summary.totalPnl ?? 0) >= 0

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-6">
                    <div className="mb-2">
                        <span className="text-sm text-muted-foreground font-medium">Net Worth</span>
                    </div>
                    <div className="flex items-baseline gap-3">
                        {isLoading ? (
                            <div className="h-10 w-48 bg-muted/30 rounded-md animate-pulse" />
                        ) : (
                            <span className="text-3xl font-bold font-mono tracking-tight">
                                {formatUsd(summary.netWorth)}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-6">
                    <div className="mb-2">
                        <span className="text-sm text-muted-foreground font-medium">Total PNL</span>
                    </div>
                    <div className="flex items-baseline gap-3">
                        {isLoading || summary.totalPnl === null ? (
                            <span className="text-3xl font-bold font-mono tracking-tight text-muted-foreground">
                                --
                            </span>
                        ) : (
                            <span
                                className={cn(
                                    'text-3xl font-bold font-mono tracking-tight',
                                    isPositive ? 'text-emerald-500' : 'text-red-500'
                                )}
                            >
                                {formatPnl(summary.totalPnl)}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
