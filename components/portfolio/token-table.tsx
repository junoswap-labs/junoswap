'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { TokenRow } from '@/components/portfolio/token-row'
import { usePortfolioStore } from '@/store/portfolio-store'
import { cn } from '@/lib/utils'
import type { PortfolioToken, PortfolioSortKey } from '@/types/portfolio'

interface TokenTableProps {
    tokens: PortfolioToken[]
    isLoading: boolean
}

type SortDirection = 'asc' | 'desc'

function SortHeader({
    label,
    sortKey,
    className,
    sortBy,
    sortDirection,
    onSort,
}: {
    label: string
    sortKey: PortfolioSortKey
    className?: string
    sortBy: PortfolioSortKey
    sortDirection: SortDirection
    onSort: (key: PortfolioSortKey) => void
}) {
    const isActive = sortBy === sortKey
    return (
        <TableHead
            className={cn(
                'cursor-pointer select-none hover:text-foreground transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground',
                className
            )}
            onClick={() => onSort(sortKey)}
        >
            <div
                className={cn(
                    'flex items-center gap-1',
                    className?.includes('text-right') && 'justify-end'
                )}
            >
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
                        <SortHeader
                            label="Asset"
                            sortKey="name"
                            sortBy={sortBy}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="w-[200px]"
                        />
                        <SortHeader
                            label="Balance"
                            sortKey="balance"
                            sortBy={sortBy}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="text-right"
                        />
                        <TableHead className="text-right">Price</TableHead>
                        <SortHeader
                            label="Value"
                            sortKey="value"
                            sortBy={sortBy}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="text-right"
                        />
                        <SortHeader
                            label="PNL"
                            sortKey="pnl"
                            sortBy={sortBy}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="text-right"
                        />
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
