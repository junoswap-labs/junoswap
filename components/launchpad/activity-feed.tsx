'use client'

import Link from 'next/link'
import { formatEther } from 'viem'

import { EmptyState } from '@/components/ui/empty-state'
import { useAllSwapEvents } from '@/hooks/useAllSwapEvents'
import { formatTokenAmount, formatCompact } from '@/services/launchpad'
import { formatAddress, cn, formatTimeAgo } from '@/lib/utils'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { getExplorerAddressUrl } from '@/lib/explorer'
import type { EnrichedSwapEvent } from '@/types/launchpad'

function TradeChip({ event }: { event: EnrichedSwapEvent }) {
    const valueKub = event.isBuy
        ? parseFloat(formatEther(event.amountIn))
        : parseFloat(formatEther(event.amountOut))

    const tokenAmount = event.isBuy
        ? parseFloat(formatEther(event.amountOut))
        : parseFloat(formatEther(event.amountIn))

    const symbol = event.tokenSymbol || '???'

    return (
        <Link
            href={`/launchpad/token/${event.tokenAddr}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-card/50 px-2.5 py-1 text-[11px] transition-colors hover:border-primary/40 hover:bg-accent/50"
        >
            {/* Buy/Sell dot */}
            <span
                className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    event.isBuy ? 'bg-positive' : 'bg-negative'
                )}
            />
            {/* Symbol */}
            <span className="font-semibold">{symbol}</span>
            {/* Action */}
            <span className={cn('font-medium', event.isBuy ? 'text-positive' : 'text-negative')}>
                {event.isBuy ? 'bought' : 'sold'}
            </span>
            {/* Amount */}
            <span className="font-mono tabular-nums tracking-tight">
                {formatTokenAmount(BigInt(Math.round(tokenAmount * 1e18)))}
            </span>
            {/* Value */}
            <span className="text-muted-foreground">{formatCompact(valueKub)} KUB</span>
            {/* Wallet */}
            <span
                className="hidden cursor-pointer font-mono text-muted-foreground hover:text-foreground transition-colors sm:inline"
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    window.open(
                        getExplorerAddressUrl(PUMP_CORE_NATIVE_CHAIN_ID, event.sender),
                        '_blank'
                    )
                }}
            >
                {formatAddress(event.sender)}
            </span>
            {/* Time */}
            <span className="text-muted-foreground">{formatTimeAgo(event.timestamp)} </span>
        </Link>
    )
}

function SkeletonTicker() {
    return (
        <div className="flex items-center gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-card/50 px-2.5 py-1"
                >
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                    <div className="h-3 w-10 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-8 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-8 animate-pulse rounded bg-muted" />
                </div>
            ))}
        </div>
    )
}

export function ActivityTicker() {
    const { data: events, isLoading } = useAllSwapEvents()

    if (isLoading) {
        return (
            <div className="mb-4 overflow-hidden px-3 py-2">
                <SkeletonTicker />
            </div>
        )
    }

    if (events.length === 0) {
        return <EmptyState title="No recent activity" className="mb-4 px-3 py-2" />
    }

    // Duplicate events for seamless loop
    const tickerItems = events.length > 3 ? [...events, ...events] : events

    return (
        <div className="mb-4 overflow-hidden">
            <div className="flex items-center">
                {/* Scrolling trades */}
                <div className="min-w-0 flex-1 overflow-hidden py-2 pl-3">
                    <div className="ticker-scroll flex items-center gap-2">
                        {tickerItems.map((event, i) => (
                            <TradeChip key={`${event.transactionHash}-${i}`} event={event} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
