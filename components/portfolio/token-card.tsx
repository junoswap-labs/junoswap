'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { PortfolioToken } from '@/types/portfolio'

interface TokenCardProps {
    portfolioToken: PortfolioToken
}

function formatUsdShort(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    if (value >= 1) return `$${value.toFixed(2)}`
    if (value >= 0.01) return `$${value.toFixed(3)}`
    if (value > 0) return `$${value.toFixed(6)}`
    return '$0.00'
}

function formatBalanceShort(balance: string): string {
    const num = parseFloat(balance)
    if (isNaN(num)) return '0'
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    if (num >= 1) return num.toFixed(4)
    if (num >= 0.0001) return num.toFixed(6)
    if (num > 0) return num.toFixed(8)
    return '0'
}

export function TokenCard({ portfolioToken }: TokenCardProps) {
    const { token, formattedBalance, valueUsd, pnlUsd, tokenType } = portfolioToken
    const isPnlPositive = (pnlUsd ?? 0) >= 0
    const typeLabel = tokenType === 'bonding_curve' ? 'Launchpad' : null

    return (
        <Card className="position-card-hover">
            <CardContent className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    {/* Token identity */}
                    <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage src={token.logo} alt={token.symbol} />
                            <AvatarFallback className="text-xs bg-muted">
                                {token.symbol.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm truncate">{token.symbol}</span>
                                {typeLabel && (
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] px-1.5 py-0 h-4 font-mono shrink-0"
                                    >
                                        {typeLabel}
                                    </Badge>
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground truncate block">
                                {formatBalanceShort(formattedBalance)}
                            </span>
                        </div>
                    </div>

                    {/* Value & PNL */}
                    <div className="text-right shrink-0">
                        <div className="font-mono text-sm font-medium">
                            {formatUsdShort(valueUsd)}
                        </div>
                        {pnlUsd !== null ? (
                            <span
                                className={cn(
                                    'font-mono text-xs font-medium',
                                    isPnlPositive ? 'text-emerald-500' : 'text-red-500'
                                )}
                            >
                                {isPnlPositive ? '+' : '-'}${Math.abs(pnlUsd).toFixed(2)}
                            </span>
                        ) : (
                            <span className="font-mono text-xs text-muted-foreground">--</span>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
