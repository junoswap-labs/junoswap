'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { PortfolioToken } from '@/types/portfolio'

interface TokenRowProps {
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

export function TokenRow({ portfolioToken }: TokenRowProps) {
    const { token, formattedBalance, priceUsd, valueUsd, pnlUsd, tokenType } = portfolioToken
    const isPnlPositive = (pnlUsd ?? 0) >= 0

    const typeLabel = tokenType === 'bonding_curve' ? 'Launchpad' : null

    return (
        <TableRow className="hover:bg-muted/30 transition-colors">
            <TableCell>
                <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={token.logo} alt={token.symbol} />
                        <AvatarFallback className="text-xs bg-muted">
                            {token.symbol.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{token.symbol}</span>
                            {typeLabel && (
                                <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 h-4 font-mono"
                                >
                                    {typeLabel}
                                </Badge>
                            )}
                        </div>
                        <span className="text-xs text-muted-foreground">{token.name}</span>
                    </div>
                </div>
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
                {formatBalanceShort(formattedBalance)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
                {priceUsd !== null ? (
                    formatUsdShort(priceUsd)
                ) : (
                    <span className="text-muted-foreground">--</span>
                )}
            </TableCell>
            <TableCell className="text-right font-mono text-sm font-medium">
                {formatUsdShort(valueUsd)}
            </TableCell>
            <TableCell className="text-right">
                {pnlUsd !== null ? (
                    <span
                        className={cn(
                            'font-mono text-sm font-medium',
                            isPnlPositive ? 'text-emerald-500' : 'text-red-500'
                        )}
                    >
                        {isPnlPositive ? '+' : ''}${Math.abs(pnlUsd).toFixed(2)}
                    </span>
                ) : (
                    <span className="text-muted-foreground font-mono text-sm">--</span>
                )}
            </TableCell>
        </TableRow>
    )
}
