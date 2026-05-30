'use client'

import { ArrowUpDown } from 'lucide-react'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TokenRow } from '@/components/portfolio/token-row'
import { usePortfolioStore } from '@/store/portfolio-store'
import { cn } from '@/lib/utils'
import type { PortfolioToken, PortfolioSortKey } from '@/types/portfolio'

interface TokenTableProps {
    tokens: PortfolioToken[]
    isLoading: boolean
}

function SortHeader({
    label,
    sortKey,
    className,
    sortBy,
    onSort,
}: {
    label: string
    sortKey: PortfolioSortKey
    className?: string
    sortBy: PortfolioSortKey
    onSort: (key: PortfolioSortKey) => void
}) {
    return (
        <Button
            variant="ghost"
            size="sm"
            className={cn('h-auto p-0 font-medium text-xs hover:bg-transparent', className)}
            onClick={() => onSort(sortKey)}
        >
            {label}
            <ArrowUpDown
                className={cn(
                    'ml-1 h-3 w-3',
                    sortBy === sortKey ? 'text-foreground' : 'text-muted-foreground/50'
                )}
            />
        </Button>
    )
}

export function TokenTable({ tokens, isLoading }: TokenTableProps) {
    const { settings, setSortBy, setSortDirection } = usePortfolioStore()
    const { sortBy, sortDirection } = settings

    const handleSort = (key: PortfolioSortKey) => {
        if (sortBy === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortBy(key)
            setSortDirection('desc')
        }
    }

    const sorted = [...tokens].sort((a, b) => {
        let cmp = 0
        switch (sortBy) {
            case 'value':
                cmp = a.valueUsd - b.valueUsd
                break
            case 'balance':
                cmp = parseFloat(a.formattedBalance) - parseFloat(b.formattedBalance)
                break
            case 'pnl':
                cmp = (a.pnlPercent ?? -Infinity) - (b.pnlPercent ?? -Infinity)
                break
            case 'name':
                cmp = a.token.symbol.localeCompare(b.token.symbol)
                break
        }
        return sortDirection === 'desc' ? -cmp : cmp
    })

    if (isLoading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-14 bg-muted/20 rounded-lg animate-pulse" />
                ))}
            </div>
        )
    }

    if (tokens.length === 0) {
        return (
            <EmptyState
                title="No Token Balances"
                description="You don't hold any tokens on this chain yet."
                variant="subtle"
            />
        )
    }

    return (
        <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                        <TableHead className="w-[200px]">
                            <SortHeader
                                label="Asset"
                                sortKey="name"
                                sortBy={sortBy}
                                onSort={handleSort}
                            />
                        </TableHead>
                        <TableHead className="text-right">
                            <SortHeader
                                label="Balance"
                                sortKey="balance"
                                className="justify-end"
                                sortBy={sortBy}
                                onSort={handleSort}
                            />
                        </TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">
                            <SortHeader
                                label="Value"
                                sortKey="value"
                                className="justify-end"
                                sortBy={sortBy}
                                onSort={handleSort}
                            />
                        </TableHead>
                        <TableHead className="text-right">
                            <SortHeader
                                label="PNL"
                                sortKey="pnl"
                                className="justify-end"
                                sortBy={sortBy}
                                onSort={handleSort}
                            />
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sorted.map((token) => (
                        <TokenRow key={token.token.address.toLowerCase()} portfolioToken={token} />
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
