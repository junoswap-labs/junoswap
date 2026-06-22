'use client'

import { useState } from 'react'
import type { Address } from 'viem'
import { useTokenHolders } from '@/hooks/useTokenHolders'
import type { HolderData } from '@/hooks/useTokenHolders'
import { BONDING_CURVE_JUNOSWAP_CHAIN_ID } from '@/lib/abis/bonding-curve-junoswap'
import { ExplorerLink } from '@/components/ui/explorer-link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10

interface TokenHoldersProps {
    tokenAddr: Address
    creator?: Address
    poolAddress?: Address
    isGraduated?: boolean
    className?: string
}

function HolderRow({
    holder,
    index,
    isCreator,
}: {
    holder: HolderData
    index: number
    isCreator: boolean
}) {
    return (
        <TableRow
            className={cn('transition-colors hover:bg-muted/30', index % 2 === 1 && 'bg-muted/10')}
        >
            <TableCell className="py-2.5 font-mono text-xs">
                <div className="flex items-center gap-1.5">
                    <ExplorerLink
                        value={holder.address}
                        type="address"
                        chainId={BONDING_CURVE_JUNOSWAP_CHAIN_ID}
                        compact
                    />
                    {isCreator && (
                        <Badge variant="outline" className="h-4 px-1 py-0 text-[9px] font-medium">
                            Creator
                        </Badge>
                    )}
                </div>
            </TableCell>
            <TableCell className="w-24 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                {holder.percentage.toFixed(2)}%
            </TableCell>
        </TableRow>
    )
}

function LoadingState() {
    return (
        <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell>
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    )
}

export function TokenHolders({
    tokenAddr,
    creator,
    poolAddress,
    isGraduated,
    className,
}: TokenHoldersProps) {
    const [page, setPage] = useState(1)
    const {
        holders: rawHolders,
        holderCount: rawHolderCount,
        isLoading,
    } = useTokenHolders(tokenAddr, poolAddress, isGraduated)
    const filteredPool = isGraduated && poolAddress
    const holders = filteredPool
        ? rawHolders.filter((h) => h.address.toLowerCase() !== poolAddress!.toLowerCase())
        : rawHolders
    const holderCount = filteredPool ? Math.max(0, rawHolderCount - 1) : rawHolderCount

    const totalPages = Math.ceil(holders.length / PAGE_SIZE)
    const paginatedHolders = holders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const tableHeader = (
        <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">
                    Address
                </TableHead>
                <TableHead className="w-28 text-right text-[10px] font-semibold uppercase tracking-wider">
                    % of Supply
                </TableHead>
            </TableRow>
        </TableHeader>
    )

    return (
        <Card className={className}>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold">Holders</CardTitle>
                    {!isLoading && holderCount > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                            {holderCount}
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? (
                    <div className="px-2">
                        <Table>
                            {tableHeader}
                            <LoadingState />
                        </Table>
                    </div>
                ) : holders.length === 0 ? (
                    <EmptyState
                        title="No holders yet"
                        description="Holders will appear here once the token is traded"
                    />
                ) : (
                    <>
                        <div className="px-2">
                            <Table>
                                {tableHeader}
                                <TableBody>
                                    {paginatedHolders.map((holder, i) => (
                                        <HolderRow
                                            key={holder.address}
                                            holder={holder}
                                            index={i}
                                            isCreator={
                                                !!creator &&
                                                holder.address.toLowerCase() ===
                                                    creator.toLowerCase()
                                            }
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-border/40 px-3 py-2.5">
                                <span className="text-xs text-muted-foreground">
                                    {(page - 1) * PAGE_SIZE + 1}&ndash;
                                    {Math.min(page * PAGE_SIZE, holders.length)} of {holders.length}
                                </span>
                                <PaginationControls
                                    currentPage={page}
                                    totalPages={totalPages}
                                    onPageChange={setPage}
                                />
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}
