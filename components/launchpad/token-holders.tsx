'use client'

import type { Address } from 'viem'
import { useTokenHolders } from '@/hooks/useTokenHolders'
import type { HolderData } from '@/hooks/useTokenHolders'
import { formatTokenAmount } from '@/services/launchpad'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ExplorerLink } from '@/components/ui/explorer-link'
import { Users } from 'lucide-react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/ui/empty-state'

interface TokenHoldersProps {
    tokenAddr: Address
    className?: string
}

function HolderRow({ holder, rank }: { holder: HolderData; rank: number }) {
    return (
        <TableRow>
            <TableCell className="w-8 text-muted-foreground">{rank}</TableCell>
            <TableCell className="font-mono text-xs">
                <ExplorerLink
                    value={holder.address}
                    type="address"
                    chainId={PUMP_CORE_NATIVE_CHAIN_ID}
                    compact
                />
            </TableCell>
            <TableCell className="text-right font-mono tracking-tight">
                {formatTokenAmount(holder.balance)}
            </TableCell>
            <TableCell className="w-24">
                <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full bg-primary/60"
                            style={{
                                width: `${Math.min(holder.percentage * 5, 100)}%`,
                            }}
                        />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                        {holder.percentage.toFixed(2)}%
                    </span>
                </div>
            </TableCell>
        </TableRow>
    )
}

function LoadingState() {
    return (
        <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                    <TableCell>
                        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="ml-auto h-4 w-24 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    )
}

export function TokenHolders({ tokenAddr, className }: TokenHoldersProps) {
    const { holders, holderCount, isLoading } = useTokenHolders(tokenAddr)

    const tableHeader = (
        <TableHeader>
            <TableRow>
                <TableHead className="w-8 text-[10px] uppercase tracking-wider">#</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Address</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    Holdings
                </TableHead>
                <TableHead className="w-24 text-[10px] uppercase tracking-wider">%</TableHead>
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
            <CardContent className="p-0 pb-2">
                {isLoading ? (
                    <Table>
                        {tableHeader}
                        <LoadingState />
                    </Table>
                ) : holders.length === 0 ? (
                    <EmptyState
                        compact
                        icon={Users}
                        variant="subtle"
                        title="No holders yet"
                        description="Holders will appear here once the token is traded"
                    />
                ) : (
                    <ScrollArea className="h-[240px] sm:h-[280px] md:h-[320px]">
                        <Table>
                            {tableHeader}
                            <TableBody>
                                {holders.map((holder, i) => (
                                    <HolderRow key={holder.address} holder={holder} rank={i + 1} />
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    )
}
