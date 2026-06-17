'use client'

import { useState, useMemo, type ReactNode } from 'react'
import { formatEther } from 'viem'
import type { Address } from 'viem'
import { ExternalLink, ArrowUpRight, ArrowDownLeft } from 'lucide-react'

import { useUserActivity } from '@/hooks/useUserActivity'
import { useNativeUsdPriceContext } from '@/components/launchpad/native-usd-price-provider'
import { formatKub, formatTokenAmount, formatCompact } from '@/services/launchpad'
import { cn, formatTimeAgo, formatAddress } from '@/lib/utils'
import { getExplorerTxUrl } from '@/lib/explorer'
import { getChainMetadata } from '@/lib/wagmi'
import { findTokenByAddress } from '@/lib/tokens'
import { TokenIcon, TokenIconSkeleton } from '@/components/ui/token-icon'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { PaginationControls } from '@/components/ui/pagination'

import type { ActivityEvent } from '@/types/portfolio'

const PAGE_SIZE = 20
const NATIVE_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

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

function TypeChip({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[11px] font-semibold',
                className
            )}
        >
            {children}
        </span>
    )
}

function AmountLeg({
    src,
    symbol,
    sign,
    amount,
    tone,
}: {
    src?: string | null
    symbol: string
    sign: string
    amount: string
    tone: string
}) {
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs tracking-tight sm:text-sm">
            <TokenIcon src={src || undefined} symbol={symbol} size="xs" />
            <span className={cn('font-semibold', tone)}>
                {sign}
                {amount}
            </span>
            <span className="text-muted-foreground">{symbol}</span>
        </span>
    )
}

function ActivityRow({
    event,
    nativeLogo,
    nativeSymbol,
    nativeUsdPrice,
    chainId,
}: {
    event: ActivityEvent
    nativeLogo?: string
    nativeSymbol: string
    nativeUsdPrice: number | null
    chainId: number
}) {
    const txUrl = getExplorerTxUrl(chainId, event.transactionHash)
    const isTransfer = event.kind === 'transfer'

    // Trade legs: a buy gives native / receives token; a sell gives token / receives native.
    const nativeAmount = BigInt(event.isBuy ? event.amountIn : event.amountOut)
    const tokenAmount = BigInt(event.isBuy ? event.amountOut : event.amountIn)
    const valueKub = parseFloat(formatEther(nativeAmount))
    const displayValue = nativeUsdPrice !== null ? valueKub * nativeUsdPrice : valueKub
    const outIsNative = event.isBuy
    const outText = outIsNative ? formatKub(nativeAmount) : formatTokenAmount(tokenAmount)
    const inText = outIsNative ? formatTokenAmount(tokenAmount) : formatKub(nativeAmount)
    const outSrc = outIsNative ? nativeLogo : event.tokenLogo
    const outSymbol = outIsNative ? nativeSymbol : event.tokenSymbol
    const inSrc = outIsNative ? event.tokenLogo : nativeLogo
    const inSymbol = outIsNative ? event.tokenSymbol : nativeSymbol

    // Transfer direction.
    const isSent = event.direction === 'out'
    const transferAmount = BigInt(event.transferAmount ?? '0')
    const counterparty = event.counterparty ?? ''
    const TransferIcon = isSent ? ArrowUpRight : ArrowDownLeft

    return (
        <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted/30 sm:px-4"
        >
            {/* Type chip — leads every row (neutral; direction is read from the amount color + arrow) */}
            <TypeChip className="bg-muted text-muted-foreground">
                {isTransfer ? (isSent ? 'Send' : 'Receive') : 'Swap'}
            </TypeChip>

            {/* Token icon(s) sit directly in front of each amount */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                {isTransfer ? (
                    <>
                        <AmountLeg
                            src={event.tokenLogo}
                            symbol={event.tokenSymbol}
                            sign={isSent ? '-' : '+'}
                            amount={formatTokenAmount(transferAmount)}
                            tone={isSent ? 'text-negative' : 'text-positive'}
                        />
                        <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            <TransferIcon className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                                {isSent ? 'to ' : 'from '}
                                <span className="font-mono">{formatAddress(counterparty)}</span>
                            </span>
                        </span>
                    </>
                ) : (
                    <>
                        <AmountLeg
                            src={outSrc}
                            symbol={outSymbol}
                            sign="-"
                            amount={outText}
                            tone="text-negative"
                        />
                        <AmountLeg
                            src={inSrc}
                            symbol={inSymbol}
                            sign="+"
                            amount={inText}
                            tone="text-positive"
                        />
                    </>
                )}
            </div>

            {/* Right: USD value (trades only) + time + explorer link */}
            <div className="shrink-0 text-right">
                {!isTransfer && (
                    <div className="font-mono text-xs tracking-tight text-muted-foreground sm:text-sm">
                        {nativeUsdPrice !== null
                            ? `$${formatCompact(displayValue)}`
                            : `${formatCompact(displayValue)} ${nativeSymbol}`}
                    </div>
                )}
                <div
                    className={cn(
                        'flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground',
                        !isTransfer && 'mt-0.5'
                    )}
                >
                    <span>{formatTimeAgo(event.timestamp)}</span>
                    <ExternalLink className="h-3 w-3" />
                </div>
            </div>
        </a>
    )
}

// Loading skeleton mirrors the row layout

function LoadingSkeleton() {
    return (
        <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-3 sm:px-4">
                    <div className="h-5 w-12 shrink-0 animate-pulse rounded bg-muted/50" />
                    <div className="flex flex-1 flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <TokenIconSkeleton size="xs" />
                            <div className="h-3.5 w-20 animate-pulse rounded bg-muted/40" />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <TokenIconSkeleton size="xs" />
                            <div className="h-3.5 w-24 animate-pulse rounded bg-muted/40" />
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <div className="h-3.5 w-14 animate-pulse rounded bg-muted/40" />
                        <div className="h-3 w-10 animate-pulse rounded bg-muted/30" />
                    </div>
                </div>
            ))}
        </div>
    )
}

interface ActivityTabProps {
    address: Address
    chainId: number
}

export function ActivityTab({ address, chainId }: ActivityTabProps) {
    const [page, setPage] = useState(1)

    const { data: result, isLoading } = useUserActivity(address, chainId, page, 'all')
    const { nativeUsdPrice } = useNativeUsdPriceContext()

    // Resolve the native token (logo + symbol) once per chain for swap-pair icons.
    const nativeToken = useMemo(() => findTokenByAddress(chainId, NATIVE_ADDRESS), [chainId])
    const nativeSymbol = nativeToken?.symbol ?? getChainMetadata(chainId)?.symbol ?? 'KUB'
    const nativeLogo = nativeToken?.logo

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
                                <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
                                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                        {group.label}
                                    </span>
                                    <Separator className="flex-1 bg-border/40" />
                                </div>

                                {/* Activity rows */}
                                {group.events.map((event) => (
                                    <ActivityRow
                                        key={event.id}
                                        event={event}
                                        nativeLogo={nativeLogo}
                                        nativeSymbol={nativeSymbol}
                                        nativeUsdPrice={nativeUsdPrice}
                                        chainId={chainId}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="mt-2 flex items-center justify-center border-t border-border/40 px-3 py-3">
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
