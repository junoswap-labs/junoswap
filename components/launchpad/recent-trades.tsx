'use client'

import { useState } from 'react'
import { formatEther } from 'viem'
import type { Address } from 'viem'

import { useTokenSwapEvents } from '@/hooks/useTokenSwapEvents'
import { formatKub, formatTokenAmount, formatCompact } from '@/services/launchpad'
import { cn, formatTimeAgo } from '@/lib/utils'
import { getExplorerTxUrl } from '@/lib/explorer'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ExplorerLink } from '@/components/ui/explorer-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Activity } from 'lucide-react'
import type { SwapEventData } from '@/hooks/useTokenSwapEvents'
import { useNativeUsdPriceContext } from './native-usd-price-provider'

const PAGE_SIZE = 10

interface RecentTradesProps {
    tokenAddr: Address
    tokenSymbol: string
    poolAddress?: Address
    isGraduated?: boolean
    className?: string
}

function TradeRow({
    trade,
    index,
    nativeUsdPrice,
}: {
    trade: SwapEventData
    index: number
    nativeUsdPrice: number | null
}) {
    const nativeAmount = trade.isBuy ? trade.amountIn : trade.amountOut
    const tokenAmount = trade.isBuy ? trade.amountOut : trade.amountIn
    const valueKub = parseFloat(formatEther(nativeAmount))
    const displayValue = nativeUsdPrice !== null ? valueKub * nativeUsdPrice : valueKub

    return (
        <TableRow
            key={`${trade.transactionHash}-${index}`}
            className={cn(
                'cursor-pointer transition-colors hover:bg-muted/30',
                index % 2 === 1 && 'bg-muted/10'
            )}
            onClick={() =>
                window.open(
                    getExplorerTxUrl(PUMP_CORE_NATIVE_CHAIN_ID, trade.transactionHash),
                    '_blank'
                )
            }
        >
            {/* Type */}
            <TableCell className="py-2.5">
                <span
                    className={cn(
                        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold',
                        trade.isBuy
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                    )}
                >
                    {trade.isBuy ? 'Buy' : 'Sell'}
                </span>
            </TableCell>

            {/* Amount (KUB) */}
            <TableCell className="py-2.5 font-mono tracking-tight">
                {formatKub(nativeAmount)}
            </TableCell>

            {/* Token Amount */}
            <TableCell
                className={cn(
                    'py-2.5 font-mono tracking-tight',
                    trade.isBuy ? 'text-emerald-400' : 'text-red-400'
                )}
            >
                {formatTokenAmount(tokenAmount)}
            </TableCell>

            {/* Value */}
            <TableCell className="py-2.5 text-right font-mono tracking-tight text-muted-foreground">
                {nativeUsdPrice !== null
                    ? `$${formatCompact(displayValue)}`
                    : `${formatCompact(displayValue)} KUB`}
            </TableCell>

            {/* Time */}
            <TableCell className="py-2.5 text-right text-xs text-muted-foreground">
                {formatTimeAgo(trade.timestamp)}
            </TableCell>

            {/* Wallet */}
            <TableCell
                className="py-2.5 text-right font-mono text-xs text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
            >
                <ExplorerLink
                    value={trade.sender}
                    type="address"
                    chainId={PUMP_CORE_NATIVE_CHAIN_ID}
                    compact
                />
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
                        <div className="h-5 w-12 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="ml-auto h-5 w-14 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="ml-auto h-5 w-10 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="ml-auto h-5 w-16 animate-pulse rounded bg-muted" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    )
}

export function RecentTrades({
    tokenAddr,
    tokenSymbol,
    poolAddress,
    isGraduated,
    className,
}: RecentTradesProps) {
    const [page, setPage] = useState(1)
    const { data: result, isLoading } = useTokenSwapEvents(
        tokenAddr,
        page,
        PAGE_SIZE,
        poolAddress,
        isGraduated
    )
    const { nativeUsdPrice } = useNativeUsdPriceContext()

    const trades = result?.data ?? []
    const totalCount = result?.totalCount ?? 0
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    const tableHeader = (
        <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">
                    Type
                </TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">
                    Amount (KUB)
                </TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">
                    {tokenSymbol}
                </TableHead>
                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider">
                    Value
                </TableHead>
                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider">
                    Time
                </TableHead>
                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider">
                    Wallet
                </TableHead>
            </TableRow>
        </TableHeader>
    )

    return (
        <Card className={className}>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Recent Trades</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? (
                    <div className="px-2">
                        <Table>
                            {tableHeader}
                            <LoadingState />
                        </Table>
                    </div>
                ) : trades.length === 0 ? (
                    <EmptyState
                        compact
                        icon={Activity}
                        variant="subtle"
                        title="No trades yet"
                        description="Trades will appear here once the token is traded"
                    />
                ) : (
                    <>
                        <div className="px-2">
                            <Table>
                                {tableHeader}
                                <TableBody>
                                    {trades.map((trade, i) => (
                                        <TradeRow
                                            key={`${trade.transactionHash}-${i}`}
                                            trade={trade}
                                            index={i}
                                            nativeUsdPrice={nativeUsdPrice}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center border-t border-border/40 px-3 py-2.5">
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
