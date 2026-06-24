'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatEther } from 'viem'
import type { Address } from 'viem'
import { useAccount } from 'wagmi'

import { useTokenSwapEvents } from '@/hooks/useTokenSwapEvents'
import { useDebounce } from '@/hooks/useDebounce'
import { formatKub, formatTokenAmount, formatCompact } from '@/services/launchpad'
import { cn, formatTimeAgo } from '@/lib/utils'
import { getExplorerTxUrl } from '@/lib/explorer'
import { BONDING_CURVE_JUNOSWAP_CHAIN_ID } from '@/lib/abis/bonding-curve-junoswap'
import { PortfolioLink } from '@/components/ui/portfolio-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
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
import { Search, ArrowUpDown, User, SlidersHorizontal } from 'lucide-react'
import type { SwapEventData } from '@/hooks/useTokenSwapEvents'
import { useNativeUsdPriceContext } from './native-usd-price-provider'

const PAGE_SIZE = 10

const SIZE_OPTIONS = [
    { value: 'all', label: 'All Sizes' },
    { value: 'small', label: '< 1 KUB' },
    { value: 'medium', label: '1–10 KUB' },
    { value: 'large', label: '10–100 KUB' },
    { value: 'whale', label: '> 100 KUB' },
] as const

const SIZE_THRESHOLDS: Record<string, { min: number; max: number }> = {
    all: { min: 0, max: Infinity },
    small: { min: 0, max: 1 },
    medium: { min: 1, max: 10 },
    large: { min: 10, max: 100 },
    whale: { min: 100, max: Infinity },
}

const TYPE_OPTIONS = [
    { value: 'all', label: 'All Trades' },
    { value: 'buy', label: 'Buys Only' },
    { value: 'sell', label: 'Sells Only' },
]

interface RecentTradesProps {
    tokenAddr: Address
    tokenSymbol: string
    poolAddress?: Address
    isGraduated?: boolean
    creatorAddress?: Address
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
                    getExplorerTxUrl(BONDING_CURVE_JUNOSWAP_CHAIN_ID, trade.transactionHash),
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
                            ? 'bg-positive/15 text-positive'
                            : 'bg-negative/15 text-negative'
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
                    trade.isBuy ? 'text-positive' : 'text-negative'
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
                <PortfolioLink address={trade.sender} />
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
    creatorAddress,
    className,
}: RecentTradesProps) {
    const [page, setPage] = useState(1)
    const [typeFilter, setTypeFilter] = useState('all')
    const [accountFilter, setAccountFilter] = useState('all')
    const [addressSearch, setAddressSearch] = useState('')
    const [sizeFilter, setSizeFilter] = useState('all')

    const debouncedSearch = useDebounce(addressSearch, 300)
    const { address: connectedAddress } = useAccount()
    const { nativeUsdPrice } = useNativeUsdPriceContext()

    // Resolve the effective sender filter for the hook
    const hookSenderFilter = useMemo(() => {
        if (debouncedSearch) return debouncedSearch.toLowerCase()
        if (accountFilter === 'creator' && creatorAddress) return creatorAddress.toLowerCase()
        if (accountFilter === 'you' && connectedAddress) return connectedAddress.toLowerCase()
        return undefined
    }, [accountFilter, creatorAddress, connectedAddress, debouncedSearch])

    // Resolve isBuy filter for the hook
    const hookIsBuyFilter = useMemo<boolean | undefined>(() => {
        if (typeFilter === 'buy') return true
        if (typeFilter === 'sell') return false
        return undefined
    }, [typeFilter])

    // Reset page when filters change
    const filterKey = `${typeFilter}-${hookSenderFilter}-${sizeFilter}`
    useEffect(() => {
        setPage(1)
    }, [filterKey])

    const { data: result, isLoading } = useTokenSwapEvents(
        tokenAddr,
        page,
        PAGE_SIZE,
        poolAddress,
        isGraduated,
        {
            isBuy: hookIsBuyFilter,
            sender: hookSenderFilter,
        }
    )

    // Client-side size filtering
    const filteredTrades = useMemo(() => {
        const raw = result?.data ?? []
        if (sizeFilter === 'all') return raw

        const threshold = SIZE_THRESHOLDS[sizeFilter]
        if (!threshold) return raw

        return raw.filter((trade) => {
            const nativeAmount = trade.isBuy ? trade.amountIn : trade.amountOut
            const valueKub = parseFloat(formatEther(nativeAmount))
            return valueKub >= threshold.min && valueKub < threshold.max
        })
    }, [result?.data, sizeFilter])

    const totalCount = result?.totalCount ?? 0
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    // Active account options (conditional on available data)
    const activeAccountOptions = useMemo(() => {
        const opts = [{ value: 'all', label: 'All Accounts' }]
        if (creatorAddress) opts.push({ value: 'creator', label: 'Creator' })
        if (connectedAddress) opts.push({ value: 'you', label: 'You' })
        return opts
    }, [creatorAddress, connectedAddress])

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

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 pb-3">
                {/* Type Filter Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                'h-7 gap-1.5 rounded-lg border-input text-xs',
                                typeFilter !== 'all' && 'border-primary/40 bg-primary/5'
                            )}
                        >
                            <ArrowUpDown className="h-3 w-3" />
                            <span className="hidden sm:inline">
                                {TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label ??
                                    'All Trades'}
                            </span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-36">
                        <DropdownMenuRadioGroup value={typeFilter} onValueChange={setTypeFilter}>
                            {TYPE_OPTIONS.map((opt) => (
                                <DropdownMenuRadioItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-xs"
                                >
                                    {opt.label}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Account Filter Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                'h-7 gap-1.5 rounded-lg border-input text-xs',
                                accountFilter !== 'all' && 'border-primary/40 bg-primary/5'
                            )}
                        >
                            <User className="h-3 w-3" />
                            <span className="hidden sm:inline">
                                {activeAccountOptions.find((o) => o.value === accountFilter)
                                    ?.label ?? 'All Accounts'}
                            </span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-36">
                        <DropdownMenuRadioGroup
                            value={accountFilter}
                            onValueChange={(v) => {
                                setAccountFilter(v)
                                setAddressSearch('')
                            }}
                        >
                            {activeAccountOptions.map((opt) => (
                                <DropdownMenuRadioItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-xs"
                                >
                                    {opt.label}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Size Filter Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                'h-7 gap-1.5 rounded-lg border-input text-xs',
                                sizeFilter !== 'all' && 'border-primary/40 bg-primary/5'
                            )}
                        >
                            <SlidersHorizontal className="h-3 w-3" />
                            <span className="hidden sm:inline">
                                {SIZE_OPTIONS.find((o) => o.value === sizeFilter)?.label ??
                                    'All Sizes'}
                            </span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuRadioGroup value={sizeFilter} onValueChange={setSizeFilter}>
                            {SIZE_OPTIONS.map((opt) => (
                                <DropdownMenuRadioItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-xs"
                                >
                                    {opt.label}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Address search input */}
                <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search wallet"
                        value={addressSearch}
                        onChange={(e) => {
                            setAddressSearch(e.target.value)
                            if (e.target.value) setAccountFilter('all')
                        }}
                        className="h-7 w-full rounded-lg border border-input bg-muted/30 pl-8 text-xs"
                    />
                </div>
            </div>

            <CardContent className="p-0">
                {isLoading ? (
                    <div className="px-2">
                        <Table>
                            {tableHeader}
                            <LoadingState />
                        </Table>
                    </div>
                ) : filteredTrades.length === 0 && (result?.data?.length ?? 0) > 0 ? (
                    <EmptyState
                        title="No matching trades"
                        description="Try adjusting your filters"
                    />
                ) : filteredTrades.length === 0 ? (
                    <EmptyState
                        title="No trades yet"
                        description="Trades will appear here once the token is traded"
                    />
                ) : (
                    <>
                        <div className="px-2">
                            <Table>
                                {tableHeader}
                                <TableBody>
                                    {filteredTrades.map((trade, i) => (
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
