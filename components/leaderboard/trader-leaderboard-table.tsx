'use client'

import { cn, formatAddress } from '@/lib/utils'
import { formatCompact } from '@/services/launchpad'
import { getExplorerAddressUrl } from '@/lib/explorer'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { PaginationControls } from '@/components/ui/pagination'
import { ArrowUp, ArrowDown } from 'lucide-react'
import type { TraderAgg } from '@/hooks/useLeaderboardTraders'
import type { TraderSortKey, SortDirection } from '@/types/leaderboard'

interface TraderLeaderboardTableProps {
    traders: TraderAgg[]
    totalPages: number
    currentPage: number
    onPageChange: (page: number) => void
    nativeUsdPrice: number | null
    isLoading: boolean
    sortKey: TraderSortKey
    sortDirection: SortDirection
    onSort: (key: TraderSortKey) => void
    chainId: number
}

function formatUsd(value: number, nativeUsdPrice: number | null): string {
    const usd = nativeUsdPrice !== null ? value * nativeUsdPrice : value
    return `$${formatCompact(usd)}`
}

function RankCell({ rank }: { rank: number }) {
    return <span className="font-mono text-muted-foreground">{rank}</span>
}

function PnlCell({ pnlUsd }: { pnlUsd: number }) {
    const isPositive = pnlUsd >= 0
    const colorClass = isPositive ? 'text-positive' : 'text-negative'

    return (
        <span className={cn('font-mono tracking-tight text-sm', colorClass)}>
            {isPositive ? '+' : '-'}${formatCompact(Math.abs(pnlUsd))}
        </span>
    )
}

function SortableHead({
    label,
    sortKey,
    activeSortKey,
    sortDirection,
    onSort,
    className,
}: {
    label: string
    sortKey: TraderSortKey
    activeSortKey: TraderSortKey
    sortDirection: SortDirection
    onSort: (key: TraderSortKey) => void
    className?: string
}) {
    const isActive = activeSortKey === sortKey
    return (
        <TableHead
            className={cn(
                'cursor-pointer select-none hover:text-foreground transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground',
                'whitespace-nowrap',
                className
            )}
            onClick={() => onSort(sortKey)}
        >
            <div className="flex items-center gap-1">
                {label}
                {isActive &&
                    (sortDirection === 'desc' ? (
                        <ArrowDown className="h-3 w-3" />
                    ) : (
                        <ArrowUp className="h-3 w-3" />
                    ))}
            </div>
        </TableHead>
    )
}

function LoadingState() {
    return (
        <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell>
                        <div className="h-5 w-8 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    )
}

export function TraderLeaderboardTable({
    traders,
    totalPages,
    currentPage,
    onPageChange,
    nativeUsdPrice,
    isLoading,
    sortKey,
    sortDirection,
    onSort,
    chainId,
}: TraderLeaderboardTableProps) {
    const tableHeader = (
        <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-12 whitespace-nowrap">Rank</TableHead>
                <TableHead className="text-muted-foreground whitespace-nowrap">Wallet</TableHead>
                <SortableHead
                    label="Net Worth"
                    sortKey="netWorth"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                />
                <SortableHead
                    label="PnL"
                    sortKey="pnl"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                />
                <SortableHead
                    label="Volume"
                    sortKey="volume"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                />
                <SortableHead
                    label="Trades"
                    sortKey="trades"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                />
            </TableRow>
        </TableHeader>
    )

    if (isLoading) {
        return (
            <Table className="min-w-[600px]">
                {tableHeader}
                <LoadingState />
            </Table>
        )
    }

    if (traders.length === 0) {
        return (
            <EmptyState
                title="No traders found"
                description="No trading activity found for this time period"
            />
        )
    }

    return (
        <>
            <Table className="min-w-[600px]">
                {tableHeader}
                <TableBody>
                    {traders.map((trader, i) => (
                        <TableRow
                            key={trader.address}
                            className={cn(
                                'cursor-pointer transition-colors hover:bg-muted/30',
                                i % 2 === 1 && 'bg-muted/10'
                            )}
                            onClick={() =>
                                window.open(
                                    getExplorerAddressUrl(chainId, trader.address),
                                    '_blank'
                                )
                            }
                        >
                            <TableCell className="py-2.5">
                                <RankCell rank={trader.rank} />
                            </TableCell>

                            <TableCell className="py-2.5 font-mono text-sm">
                                {formatAddress(trader.address)}
                            </TableCell>

                            <TableCell className="py-2.5 font-mono tracking-tight text-sm">
                                {formatUsd(trader.netWorthNative, nativeUsdPrice)}
                            </TableCell>

                            <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                                <PnlCell pnlUsd={trader.pnlUsd} />
                            </TableCell>

                            <TableCell className="py-2.5 font-mono tracking-tight text-sm text-muted-foreground">
                                {formatUsd(trader.volumeNative, nativeUsdPrice)}
                            </TableCell>

                            <TableCell className="py-2.5 font-mono tracking-tight text-sm">
                                {trader.tradeCount}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {totalPages > 1 && (
                <div className="flex items-center justify-center border-t border-border/40 px-3 py-2.5">
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={onPageChange}
                    />
                </div>
            )}
        </>
    )
}
