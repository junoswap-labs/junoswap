'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { TokenIcon } from '@/components/ui/token-icon'
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
    const isLaunchpad = tokenType === 'bonding_curve'
    const typeLabel = isLaunchpad ? 'Launchpad' : null

    // Launchpad (bonding curve) tokens trade on their launchpad page;
    // everything else (static + graduated) trades via the swap page.
    const href = isLaunchpad
        ? `/launchpad/token/${token.address}`
        : `/swap?input=${token.address}&chain=${token.chainId}`

    return (
        <Card className="group">
            <CardContent className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <TokenIcon src={token.logo} symbol={token.symbol} size="md" />
                        <div className="relative min-w-0">
                            <div className="flex items-center gap-1.5 transition-opacity duration-150 group-hover:opacity-0">
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
                            <span className="text-xs text-muted-foreground truncate block transition-opacity duration-150 group-hover:opacity-0">
                                {formatBalanceShort(formattedBalance)}
                            </span>

                            {/* Action button — overlays the symbol & balance on hover */}
                            <Link
                                href={href}
                                aria-label={
                                    isLaunchpad ? `Trade ${token.symbol}` : `Swap ${token.symbol}`
                                }
                                className={cn(
                                    'absolute inset-y-0 left-0 flex items-center whitespace-nowrap',
                                    'rounded-md bg-foreground px-2.5 py-1',
                                    'text-xs font-medium text-background shadow-sm',
                                    'opacity-0 transition-opacity duration-150 group-hover:opacity-100'
                                )}
                            >
                                {isLaunchpad ? 'Trade' : 'Swap'}
                                <ArrowUpRight className="ml-1 h-3 w-3" />
                            </Link>
                        </div>
                    </div>

                    <div className="text-right shrink-0">
                        <div className="font-mono text-sm font-medium">
                            {formatUsdShort(valueUsd)}
                        </div>
                        {pnlUsd !== null ? (
                            <span
                                className={cn(
                                    'font-mono text-xs font-medium',
                                    isPnlPositive ? 'text-positive' : 'text-negative'
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
