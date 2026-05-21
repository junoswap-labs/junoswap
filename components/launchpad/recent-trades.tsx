'use client'

import { formatEther } from 'viem'
import type { Address } from 'viem'
import { formatDistanceToNow } from 'date-fns'

import { useTokenSwapEvents } from '@/hooks/useTokenSwapEvents'
import { formatKub, formatTokenAmount, formatCompact } from '@/services/launchpad'
import { cn } from '@/lib/utils'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/ui/empty-state'
import { Activity } from 'lucide-react'
import type { SwapEventData } from '@/hooks/useTokenSwapEvents'
import { useNativeUsdPriceContext } from './native-usd-price-provider'

interface RecentTradesProps {
    tokenAddr: Address
    tokenSymbol: string
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
            className="cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() =>
                window.open(
                    getExplorerTxUrl(PUMP_CORE_NATIVE_CHAIN_ID, trade.transactionHash),
                    '_blank'
                )
            }
        >
            {/* Type */}
            <TableCell>
                <span
                    className={cn(
                        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold',
                        trade.isBuy
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                    )}
                >
                    {trade.isBuy ? 'Buy' : 'Sell'}
                </span>
            </TableCell>

            {/* Amount (KUB) */}
            <TableCell className="hidden font-mono tracking-tight sm:table-cell">
                {formatKub(nativeAmount)}
            </TableCell>

            {/* Token Amount */}
            <TableCell
                className={cn(
                    'font-mono tracking-tight',
                    trade.isBuy ? 'text-emerald-400' : 'text-red-400'
                )}
            >
                {formatTokenAmount(tokenAmount)}
            </TableCell>

            {/* Value */}
            <TableCell className="hidden text-right font-mono tracking-tight text-muted-foreground sm:table-cell">
                {nativeUsdPrice !== null
                    ? `$${formatCompact(displayValue)}`
                    : `${formatCompact(displayValue)} KUB`}
            </TableCell>

            {/* Time */}
            <TableCell className="text-right text-muted-foreground">
                {formatDistanceToNow(trade.timestamp * 1000, {
                    addSuffix: false,
                    includeSeconds: true,
                })}
            </TableCell>

            {/* Wallet */}
            <TableCell
                className="hidden text-right font-mono text-muted-foreground lg:table-cell"
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
            {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                    <TableCell>
                        <div className="h-5 w-12 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                        <div className="ml-auto h-5 w-14 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                        <div className="ml-auto h-5 w-12 animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                        <div className="ml-auto h-5 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    )
}

export function RecentTrades({ tokenAddr, tokenSymbol, className }: RecentTradesProps) {
    const { data: events, isLoading } = useTokenSwapEvents(tokenAddr)
    const { nativeUsdPrice } = useNativeUsdPriceContext()

    const trades = events ? [...events].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20) : []

    return (
        <Card className={className}>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Recent Trades</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
                {isLoading ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-[10px] uppercase tracking-wider">
                                    Type
                                </TableHead>
                                <TableHead className="hidden text-[10px] uppercase tracking-wider sm:table-cell">
                                    Amount (KUB)
                                </TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider">
                                    {tokenSymbol}
                                </TableHead>
                                <TableHead className="hidden text-right text-[10px] uppercase tracking-wider sm:table-cell">
                                    Value
                                </TableHead>
                                <TableHead className="text-right text-[10px] uppercase tracking-wider">
                                    Time
                                </TableHead>
                                <TableHead className="hidden text-right text-[10px] uppercase tracking-wider lg:table-cell">
                                    Wallet
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <LoadingState />
                    </Table>
                ) : trades.length === 0 ? (
                    <EmptyState
                        compact
                        icon={Activity}
                        variant="subtle"
                        title="No trades yet"
                        description="Trades will appear here once the token is traded"
                    />
                ) : (
                    <ScrollArea className="h-[240px] sm:h-[280px] md:h-[320px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase tracking-wider">
                                        Type
                                    </TableHead>
                                    <TableHead className="hidden text-[10px] uppercase tracking-wider sm:table-cell">
                                        Amount (KUB)
                                    </TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-wider">
                                        {tokenSymbol}
                                    </TableHead>
                                    <TableHead className="hidden text-right text-[10px] uppercase tracking-wider sm:table-cell">
                                        Value
                                    </TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-wider">
                                        Time
                                    </TableHead>
                                    <TableHead className="hidden text-right text-[10px] uppercase tracking-wider lg:table-cell">
                                        Wallet
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
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
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    )
}
