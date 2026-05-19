'use client'

import { formatEther } from 'viem'
import type { Address } from 'viem'
import { formatDistanceToNow } from 'date-fns'

import { useTokenSwapEvents } from '@/hooks/useTokenSwapEvents'
import { calculatePrice } from '@/services/chart'
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

function formatTradePrice(price: number): string {
    if (price === 0) return '0'
    if (price < 0.00000001) return price.toExponential(2)
    if (price < 0.0001) return price.toFixed(8)
    if (price < 1) return price.toFixed(6)
    if (price < 100) return price.toFixed(4)
    return price.toFixed(2)
}

function TradeRow({
    trade,
    index,
    tokenSymbol,
    nativeUsdPrice,
}: {
    trade: SwapEventData
    index: number
    tokenSymbol: string
    nativeUsdPrice: number | null
}) {
    const price = calculatePrice(trade)
    const displayPrice = nativeUsdPrice !== null ? price * nativeUsdPrice : price
    const valueKub = trade.isBuy
        ? parseFloat(formatEther(trade.amountIn))
        : parseFloat(formatEther(trade.amountOut))
    const displayValue = nativeUsdPrice !== null ? valueKub * nativeUsdPrice : valueKub
    const amount = parseFloat(formatEther(trade.amountIn))

    return (
        <TableRow
            key={`${trade.blockNumber}-${index}`}
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

            {/* Amount */}
            <TableCell className="hidden font-mono tracking-tight sm:table-cell">
                {trade.isBuy
                    ? `${formatKub(BigInt(Math.round(amount * 1e18)))} KUB`
                    : `${formatTokenAmount(BigInt(Math.round(amount * 1e18)))} ${tokenSymbol}`}
            </TableCell>

            {/* Price */}
            <TableCell className="font-mono tracking-tight">
                {nativeUsdPrice !== null ? '$' : ''}
                {formatTradePrice(displayPrice)}
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
                        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
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
                                    Amount
                                </TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider">
                                    Price
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
                                        Amount
                                    </TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-wider">
                                        Price
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
                                        key={`${trade.blockNumber}-${i}`}
                                        trade={trade}
                                        index={i}
                                        tokenSymbol={tokenSymbol}
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
