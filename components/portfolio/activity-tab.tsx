'use client'

import { useState, useMemo } from 'react'
import { formatEther } from 'viem'
import type { Address } from 'viem'
import { ExternalLink, ArrowUpRight, ArrowDownLeft } from 'lucide-react'

import { useUserActivity } from '@/hooks/useUserActivity'
import { useNativeUsdPriceContext } from '@/components/launchpad/native-usd-price-provider'
import { formatKub, formatTokenAmount, formatCompact } from '@/services/launchpad'
import { cn, formatTimeAgo, formatAddress } from '@/lib/utils'
import { getExplorerTxUrl } from '@/lib/explorer'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { TokenIcon } from '@/components/ui/token-icon'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { PaginationControls } from '@/components/ui/pagination'

import type { ActivityEvent } from '@/types/portfolio'

const PAGE_SIZE = 20

// ── Date grouping ───────────────────────────────────────────────────

function groupByDate(events: ActivityEvent[]): { label: string; events: ActivityEvent[] }[] {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
    const yesterdayStart = todayStart - 86400

    const groups = new Map<string, ActivityEvent[]>()
    for (const event of events) {
        let label: string
        if (event.timestamp >= todayStart) {
            label = 'Today'
        } else if (event.timestamp >= yesterdayStart) {
            label = 'Yesterday'
        } else {
            const d = new Date(event.timestamp * 1000)
            label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }
        if (!groups.has(label)) groups.set(label, [])
        groups.get(label)!.push(event)
    }
    return Array.from(groups.entries()).map(([label, events]) => ({ label, events }))
}

// ── Individual trade card ───────────────────────────────────────────

function ActivityCard({
    event,
    nativeUsdPrice,
    index,
}: {
    event: ActivityEvent
    nativeUsdPrice: number | null
    index: number
}) {
    const nativeAmount = BigInt(event.isBuy ? event.amountIn : event.amountOut)
    const tokenAmount = BigInt(event.isBuy ? event.amountOut : event.amountIn)
    const valueKub = parseFloat(formatEther(nativeAmount))
    const displayValue = nativeUsdPrice !== null ? valueKub * nativeUsdPrice : valueKub
    const txUrl = getExplorerTxUrl(PUMP_CORE_NATIVE_CHAIN_ID, event.transactionHash)

    return (
        <a href={txUrl} target="_blank" rel="noopener noreferrer" className="block">
            <Card
                className={cn(
                    'transition-colors hover:bg-muted/20',
                    index % 2 === 1 && 'bg-muted/5',
                    'border-0 shadow-none rounded-lg'
                )}
            >
                <CardContent className="px-3 py-3 sm:px-4">
                    {/* Mobile layout */}
                    <div className="flex items-center gap-3 sm:hidden">
                        <TokenIcon src={event.tokenLogo} symbol={event.tokenSymbol} size="sm" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 font-mono text-sm tracking-tight">
                                <span className="font-semibold text-negative">
                                    -
                                    {event.isBuy
                                        ? formatKub(nativeAmount)
                                        : formatTokenAmount(tokenAmount)}
                                </span>
                                <span className="text-muted-foreground">
                                    {event.isBuy ? 'KUB' : event.tokenSymbol}
                                </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs tracking-tight">
                                <span className="font-semibold text-positive">
                                    +
                                    {event.isBuy
                                        ? formatTokenAmount(tokenAmount)
                                        : formatKub(nativeAmount)}
                                </span>
                                <span className="text-muted-foreground truncate">
                                    {event.isBuy ? event.tokenSymbol : 'KUB'}
                                </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                                <span className="font-mono tracking-tight">
                                    {nativeUsdPrice !== null
                                        ? `$${formatCompact(displayValue)}`
                                        : `${formatCompact(displayValue)} KUB`}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span>{formatTimeAgo(event.timestamp)}</span>
                                    <ExternalLink className="h-3 w-3" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden items-center gap-3 sm:flex">
                        <TokenIcon src={event.tokenLogo} symbol={event.tokenSymbol} size="md" />

                        <div className="flex flex-1 items-baseline gap-4 font-mono text-sm tracking-tight">
                            <span className="shrink-0">
                                <span className="font-semibold text-negative">
                                    -
                                    {event.isBuy
                                        ? formatKub(nativeAmount)
                                        : formatTokenAmount(tokenAmount)}
                                </span>
                                <span className="ml-1 text-muted-foreground">
                                    {event.isBuy ? 'KUB' : event.tokenSymbol}
                                </span>
                            </span>
                            <span className="shrink-0">
                                <span className="font-semibold text-positive">
                                    +
                                    {event.isBuy
                                        ? formatTokenAmount(tokenAmount)
                                        : formatKub(nativeAmount)}
                                </span>
                                <span className="ml-1 text-muted-foreground truncate">
                                    {event.isBuy ? event.tokenSymbol : 'KUB'}
                                </span>
                            </span>
                        </div>

                        <div className="shrink-0 text-right">
                            <div className="font-mono text-sm text-muted-foreground tracking-tight">
                                {nativeUsdPrice !== null
                                    ? `$${formatCompact(displayValue)}`
                                    : `${formatCompact(displayValue)} KUB`}
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground w-28 justify-end">
                            <span>{formatTimeAgo(event.timestamp)}</span>
                            <ExternalLink className="h-3 w-3" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </a>
    )
}

// ── Individual transfer card ────────────────────────────────────────

function TransferCard({ event, index }: { event: ActivityEvent; index: number }) {
    const isSent = event.direction === 'out'
    const amount = BigInt(event.transferAmount ?? '0')
    const counterparty = event.counterparty ?? ''
    const txUrl = getExplorerTxUrl(PUMP_CORE_NATIVE_CHAIN_ID, event.transactionHash)
    const Icon = isSent ? ArrowUpRight : ArrowDownLeft
    const amountColor = isSent ? 'text-negative' : 'text-positive'

    return (
        <a href={txUrl} target="_blank" rel="noopener noreferrer" className="block">
            <Card
                className={cn(
                    'transition-colors hover:bg-muted/20',
                    index % 2 === 1 && 'bg-muted/5',
                    'border-0 shadow-none rounded-lg'
                )}
            >
                <CardContent className="px-3 py-3 sm:px-4">
                    {/* Mobile layout */}
                    <div className="flex items-center gap-3 sm:hidden">
                        <TokenIcon src={event.tokenLogo} symbol={event.tokenSymbol} size="sm" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 font-mono text-sm tracking-tight">
                                <span className={cn('font-semibold', amountColor)}>
                                    {isSent ? '-' : '+'}
                                    {formatTokenAmount(amount)}
                                </span>
                                <span className="text-muted-foreground">{event.tokenSymbol}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Icon className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                    {isSent ? 'Sent to ' : 'Received from '}
                                    <span className="font-mono">{formatAddress(counterparty)}</span>
                                </span>
                            </div>
                            <div className="mt-1 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                                <span>{formatTimeAgo(event.timestamp)}</span>
                                <ExternalLink className="h-3 w-3" />
                            </div>
                        </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden items-center gap-3 sm:flex">
                        <TokenIcon src={event.tokenLogo} symbol={event.tokenSymbol} size="md" />

                        <div className="flex flex-1 items-baseline gap-4 font-mono text-sm tracking-tight">
                            <span className="shrink-0">
                                <span className={cn('font-semibold', amountColor)}>
                                    {isSent ? '-' : '+'}
                                    {formatTokenAmount(amount)}
                                </span>
                                <span className="ml-1 text-muted-foreground">
                                    {event.tokenSymbol}
                                </span>
                            </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <Icon className="h-3 w-3" />
                            <span>
                                {isSent ? 'Sent to ' : 'Received from '}
                                <span className="font-mono">{formatAddress(counterparty)}</span>
                            </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground w-28 justify-end">
                            <span>{formatTimeAgo(event.timestamp)}</span>
                            <ExternalLink className="h-3 w-3" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </a>
    )
}

// ── Loading skeleton ────────────────────────────────────────────────

function LoadingSkeleton() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={cn('rounded-lg px-4 py-3', i % 2 === 1 && 'bg-muted/5')}>
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 animate-pulse rounded-full bg-muted/40" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-24 animate-pulse rounded bg-muted/40" />
                            <div className="h-3 w-40 animate-pulse rounded bg-muted/30" />
                        </div>
                        <div className="h-4 w-16 animate-pulse rounded bg-muted/30" />
                        <div className="h-3 w-12 animate-pulse rounded bg-muted/30" />
                    </div>
                </div>
            ))}
        </div>
    )
}

// ── Main component ──────────────────────────────────────────────────

interface ActivityTabProps {
    address: Address
    chainId: number
}

export function ActivityTab({ address, chainId }: ActivityTabProps) {
    const [page, setPage] = useState(1)

    const { data: result, isLoading } = useUserActivity(address, chainId, page, 'all')
    const { nativeUsdPrice } = useNativeUsdPriceContext()

    const events = useMemo(() => result?.data ?? [], [result?.data])
    const totalCount = result?.totalCount ?? 0
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    const dateGroups = useMemo(() => groupByDate(events), [events])

    return (
        <div className="space-y-4">
            {isLoading ? (
                <LoadingSkeleton />
            ) : events.length === 0 ? (
                <EmptyState
                    title="No activity yet"
                    description="Your trades and transfers will appear here"
                />
            ) : (
                <>
                    <div className="space-y-1">
                        {dateGroups.map((group) => (
                            <div key={group.label}>
                                {/* Date header */}
                                <div className="flex items-center gap-3 px-3 py-2">
                                    <span className="text-xs font-medium text-muted-foreground shrink-0">
                                        {group.label}
                                    </span>
                                    <Separator className="flex-1 bg-border/40" />
                                </div>

                                {/* Activity cards */}
                                {group.events.map((event, i) =>
                                    event.kind === 'transfer' ? (
                                        <TransferCard key={event.id} event={event} index={i} />
                                    ) : (
                                        <ActivityCard
                                            key={event.id}
                                            event={event}
                                            nativeUsdPrice={nativeUsdPrice}
                                            index={i}
                                        />
                                    )
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center border-t border-border/40 px-3 py-3 mt-2">
                            <PaginationControls
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
