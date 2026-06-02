'use client'

import { cn, formatAddress } from '@/lib/utils'
import { formatCompact } from '@/services/launchpad'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
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
import { PointsTierBadge } from './points-tier-badge'
import { getTierForPoints } from '@/types/points'
import { Users, ArrowUp, ArrowDown } from 'lucide-react'
import type { PointsTrader } from '@/types/points'
import type { PointsSortKey, SortDirection } from '@/types/points'

interface PointsLeaderboardTableProps {
    traders: PointsTrader[]
    totalPages: number
    currentPage: number
    onPageChange: (page: number) => void
    isLoading: boolean
    sortKey: PointsSortKey
    sortDirection: SortDirection
    onSort: (key: PointsSortKey) => void
    userAddress?: string
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
    sortKey: PointsSortKey
    activeSortKey: PointsSortKey
    sortDirection: SortDirection
    onSort: (key: PointsSortKey) => void
    className?: string
}) {
    const isActive = activeSortKey === sortKey
    return (
        <TableHead
            className={cn(
                'cursor-pointer select-none hover:text-foreground transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground',
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
                    <TableCell className="hidden sm:table-cell">
                        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                        <div className="h-5 w-12 animate-pulse rounded bg-muted" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    )
}

export function PointsLeaderboardTable({
    traders,
    totalPages,
    currentPage,
    onPageChange,
    isLoading,
    sortKey,
    sortDirection,
    onSort,
    userAddress,
}: PointsLeaderboardTableProps) {
    const header = (
        <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-12">#</TableHead>
                <TableHead className="text-muted-foreground">Wallet</TableHead>
                <TableHead className="text-muted-foreground hidden sm:table-cell">Tier</TableHead>
                <SortableHead
                    label="Volume"
                    sortKey="volume"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    className="hidden md:table-cell"
                />
                <SortableHead
                    label="Points"
                    sortKey="points"
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
                    className="hidden lg:table-cell"
                />
            </TableRow>
        </TableHeader>
    )

    if (isLoading) {
        return (
            <Table>
                {header}
                <LoadingState />
            </Table>
        )
    }

    if (traders.length === 0) {
        return (
            <EmptyState
                compact
                icon={Users}
                variant="subtle"
                title="No traders found"
                description="No trading activity found for this time period"
            />
        )
    }

    const userAddr = userAddress?.toLowerCase()

    return (
        <>
            <Table>
                {header}
                <TableBody>
                    {traders.map((trader, i) => {
                        const isUser = userAddr && trader.address === userAddr
                        const tier = getTierForPoints(trader.points)

                        return (
                            <TableRow
                                key={trader.address}
                                className={cn(
                                    'cursor-pointer transition-colors hover:bg-muted/30',
                                    i % 2 === 1 && 'bg-muted/10',
                                    isUser && 'bg-primary/5 border-l-2 border-l-primary'
                                )}
                                onClick={() =>
                                    window.open(
                                        getExplorerAddressUrl(
                                            PUMP_CORE_NATIVE_CHAIN_ID,
                                            trader.address
                                        ),
                                        '_blank'
                                    )
                                }
                            >
                                <TableCell className="py-2.5">
                                    <span className="font-mono text-muted-foreground">
                                        {trader.rank}
                                    </span>
                                </TableCell>
                                <TableCell className="py-2.5 font-mono text-sm">
                                    {formatAddress(trader.address)}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell py-2.5">
                                    {trader.points > 0 && <PointsTierBadge tier={tier.name} />}
                                </TableCell>
                                <TableCell className="hidden md:table-cell py-2.5 font-mono tracking-tight text-sm text-muted-foreground">
                                    ${formatCompact(trader.volumeUsd)}
                                </TableCell>
                                <TableCell className="py-2.5 font-mono font-bold tracking-tight text-sm">
                                    {trader.points.toLocaleString()}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell py-2.5 font-mono tracking-tight text-sm">
                                    {trader.tradeCount}
                                </TableCell>
                            </TableRow>
                        )
                    })}
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
