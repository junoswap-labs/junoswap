'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Token } from '@/types/token'
import { cn } from '@/lib/utils'
import { useAccount, useChainId } from 'wagmi'
import { ArrowDown, ArrowUp, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TokenIconPair, TokenIconSkeleton } from '@/components/ui/token-icon'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { ConnectModal } from '@/components/web3/connect-modal'
import { getDefaultPairTokens, getDisplayToken } from '@/lib/tokens'
import { useAllPools } from '@/hooks/useAllPools'
import { formatFeeTier } from '@/lib/liquidity-helpers'
import { formatTvl, formatApr, formatChartPrice } from '@/lib/format'
import type { PoolMetrics } from '@coshi190/juno-moneta-sdk'
import { computePoolPrice } from '@/lib/tick-math'
import type { V3PoolData } from '@/types/earn'
type SortKey = 'tvl' | 'apr' | 'vol1d' | 'vol30d'
type SortDir = 'asc' | 'desc'

function SortableHeader({
    label,
    columnKey,
    sortKey,
    sortDir,
    onSort,
    className,
}: {
    label: string
    columnKey: SortKey
    sortKey: SortKey
    sortDir: SortDir
    onSort: (key: SortKey) => void
    className?: string
}) {
    const isActive = sortKey === columnKey
    return (
        <TableHead
            className={cn(
                'cursor-pointer select-none hover:text-foreground transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground',
                className
            )}
            onClick={() => onSort(columnKey)}
        >
            <div className="flex items-center gap-1">
                {label}
                {isActive &&
                    (sortDir === 'desc' ? (
                        <ArrowDown className="h-3 w-3" />
                    ) : (
                        <ArrowUp className="h-3 w-3" />
                    ))}
            </div>
        </TableHead>
    )
}

function PoolRow({
    pool,
    tvlUsd,
    isLoadingTvl,
    volume,
    isLoadingVolume,
    apr,
    isLoadingApr,
    onConnect,
    onAddLiquidity,
}: {
    pool: V3PoolData
    tvlUsd: number | null
    isLoadingTvl: boolean
    volume: { volume1d: number; volume30d: number } | null
    isLoadingVolume: boolean
    apr: number | null
    isLoadingApr: boolean
    onConnect: () => void
    onAddLiquidity: (pool: V3PoolData) => void
}) {
    const { isConnected } = useAccount()
    const chainId = useChainId()

    const { stablecoin, nativeTokens } = getDefaultPairTokens(chainId)
    const eq = (a: Token, b: Token) => a.address.toLowerCase() === b.address.toLowerCase()
    const isNative = (t: Token) => nativeTokens.some((n) => eq(t, n))
    const isToken0Stable = !!stablecoin && eq(pool.token0, stablecoin)
    const isToken0Native = isNative(pool.token0)
    const isToken1Stable = !!stablecoin && eq(pool.token1, stablecoin)
    const isToken1Native = isNative(pool.token1)

    let [display0, display1] = [pool.token0, pool.token1]
    if (isToken0Stable && isToken1Native) {
        ;[display0, display1] = [pool.token1, pool.token0]
    } else if (isToken0Native && isToken1Stable) {
        // Already NATIVE / STABLE — keep
    } else if (isToken0Stable || isToken0Native) {
        ;[display0, display1] = [pool.token1, pool.token0]
    }
    const d0 = getDisplayToken(display0)
    const d1 = getDisplayToken(display1)

    // Pool price of the displayed base (d0) in units of the displayed quote (d1). sqrtPriceX96 is
    // token1-per-token0, so invert when the display order is reversed from the pool's token order.
    const display0IsToken0 = display0.address.toLowerCase() === pool.token0.address.toLowerCase()
    const price = computePoolPrice({
        sqrtPriceX96: pool.sqrtPriceX96,
        decimals0: pool.token0.decimals,
        decimals1: pool.token1.decimals,
        invert: !display0IsToken0,
    })

    return (
        <TableRow className="border-0">
            <TableCell className="p-3">
                <div className="flex items-center gap-3">
                    <TokenIconPair
                        src0={d0.logo}
                        symbol0={d0.symbol}
                        src1={d1.logo}
                        symbol1={d1.symbol}
                        size="sm"
                    />
                    <span className="font-medium">
                        {d0.symbol} / {d1.symbol}
                    </span>
                </div>
            </TableCell>
            <TableCell className="p-3">
                <Badge variant="outline">{formatFeeTier(pool.fee)}</Badge>
            </TableCell>
            <TableCell className="p-3">
                {price > 0 ? (
                    <span className="text-sm font-medium">{formatChartPrice(price)}</span>
                ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                )}
            </TableCell>
            <TableCell className="p-3">
                {isLoadingTvl ? (
                    <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                ) : tvlUsd != null ? (
                    <span className="text-sm font-medium">{formatTvl(tvlUsd)}</span>
                ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                )}
            </TableCell>
            <TableCell className="p-3">{formatApr(apr, isLoadingApr)}</TableCell>
            <TableCell className="p-3">
                {isLoadingVolume ? (
                    <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                ) : volume?.volume1d ? (
                    <span className="text-sm font-medium">{formatTvl(volume.volume1d)}</span>
                ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                )}
            </TableCell>
            <TableCell className="p-3">
                {isLoadingVolume ? (
                    <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                ) : volume?.volume30d ? (
                    <span className="text-sm font-medium">{formatTvl(volume.volume30d)}</span>
                ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                )}
            </TableCell>
            <TableCell className="p-3 text-right">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        if (!isConnected) {
                            onConnect()
                            return
                        }
                        onAddLiquidity(pool)
                    }}
                >
                    {isConnected && <Plus />}
                    {isConnected ? 'Add' : 'Connect Wallet'}
                </Button>
            </TableCell>
        </TableRow>
    )
}

function LoadingState() {
    return (
        <TableBody>
            {[1, 2, 3].map((i) => (
                <TableRow key={i} className="border-0">
                    <TableCell className="p-3">
                        <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                                <TokenIconSkeleton size="sm" />
                                <TokenIconSkeleton size="sm" />
                            </div>
                            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                        </div>
                    </TableCell>
                    <TableCell className="p-3">
                        <div className="h-5 w-14 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="p-3">
                        <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="p-3">
                        <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="p-3">
                        <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="p-3">
                        <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="p-3">
                        <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="p-3">
                        <div className="h-8 w-20 bg-muted rounded animate-pulse ml-auto" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    )
}

const HIGHLIGHT_COUNT = 3
const HIGHLIGHT_ROTATE_MS = 4000

type Highlight = {
    pool: V3PoolData
    tvlUsd: number
    apr: number | null
    label: string
}

function HighlightLine({
    entry,
    onSelect,
}: {
    entry: Highlight
    onSelect: (pool: V3PoolData) => void
}) {
    const t0 = getDisplayToken(entry.pool.token0)
    const t1 = getDisplayToken(entry.pool.token1)
    return (
        <button
            type="button"
            onClick={() => onSelect(entry.pool)}
            className="notif-enter flex min-w-0 flex-1 items-center gap-2.5 text-left text-xs"
        >
            <TokenIconPair
                src0={t0.logo}
                symbol0={t0.symbol}
                src1={t1.logo}
                symbol1={t1.symbol}
                size="sm"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                <span className="flex items-center gap-2 truncate">
                    <span className="font-semibold text-foreground">
                        {t0.symbol} / {t1.symbol}
                    </span>
                    <span className="hidden text-muted-foreground sm:inline">
                        {formatFeeTier(entry.pool.fee)}
                    </span>
                </span>
                <span className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-foreground/80">
                        {formatTvl(entry.tvlUsd)} TVL
                    </span>
                    {entry.apr !== null && entry.apr > 0 && (
                        <span className="tabular-nums text-positive">
                            {entry.apr.toFixed(2)}% APR
                        </span>
                    )}
                </span>
            </span>
            <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {entry.label}
            </span>
        </button>
    )
}

/** Top 3 by TVL and top 3 by APR, rotating one at a time. A pool already in the
 * TVL set is skipped in the APR set, so the next-best pool takes its place. */
function PoolHighlights({
    pools,
    tvlOf,
    aprOf,
    onSelect,
}: {
    pools: V3PoolData[]
    tvlOf: (addr: string) => number | null
    aprOf: (addr: string) => number | null
    onSelect: (pool: V3PoolData) => void
}) {
    const highlights = useMemo<Highlight[]>(() => {
        const entries = pools
            .map((pool) => ({
                pool,
                tvlUsd: tvlOf(pool.address) ?? 0,
                apr: aprOf(pool.address),
            }))
            .filter((entry) => entry.tvlUsd > 0)
        const byTvl = [...entries].sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, HIGHLIGHT_COUNT)
        const taken = new Set(byTvl.map((e) => e.pool.address))
        const byApr = entries
            .filter((e) => (e.apr ?? 0) > 0 && !taken.has(e.pool.address))
            .sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0))
            .slice(0, HIGHLIGHT_COUNT)
        return [
            ...byTvl.map((e) => ({ ...e, label: 'Top TVL' })),
            ...byApr.map((e) => ({ ...e, label: 'Top APR' })),
        ]
    }, [pools, tvlOf, aprOf])

    const [index, setIndex] = useState(0)
    const hoverRef = useRef(false)

    useEffect(() => {
        if (highlights.length < 2) return
        const id = setInterval(() => {
            if (!hoverRef.current) setIndex((i) => i + 1)
        }, HIGHLIGHT_ROTATE_MS)
        return () => clearInterval(id)
    }, [highlights.length])

    const entry = highlights[index % highlights.length]
    if (!entry) return null

    return (
        <div
            className="flex min-h-12 min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-border/50 bg-card/40 px-3 py-2 sm:px-4"
            onMouseEnter={() => {
                hoverRef.current = true
            }}
            onMouseLeave={() => {
                hoverRef.current = false
            }}
        >
            <HighlightLine
                key={`${entry.pool.address}-${index}`}
                entry={entry}
                onSelect={onSelect}
            />
        </div>
    )
}

function PoolsListContent({
    pools,
    metricsByAddress,
    isLoading,
    onAddLiquidity,
}: {
    pools: V3PoolData[]
    metricsByAddress: Map<string, PoolMetrics>
    isLoading: boolean
    onAddLiquidity: (pool?: V3PoolData) => void
}) {
    const { isConnected } = useAccount()
    const tvlOf = useCallback(
        (addr: string) => metricsByAddress.get(addr.toLowerCase())?.tvlUsd ?? null,
        [metricsByAddress]
    )
    const volume1dOf = useCallback(
        (addr: string) => metricsByAddress.get(addr.toLowerCase())?.volume1dUsd ?? null,
        [metricsByAddress]
    )
    const volume30dOf = useCallback(
        (addr: string) => metricsByAddress.get(addr.toLowerCase())?.volume30dUsd ?? null,
        [metricsByAddress]
    )
    const aprOf = useCallback(
        (addr: string) => metricsByAddress.get(addr.toLowerCase())?.feeAprPercent ?? null,
        [metricsByAddress]
    )
    const [sortKey, setSortKey] = useState<SortKey>('tvl')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const handleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }
    const [search, setSearch] = useState('')
    const filteredPools = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return pools
        return pools.filter((p) =>
            [p.token0.symbol, p.token1.symbol, p.token0.name, p.token1.name].some((s) =>
                s?.toLowerCase().includes(q)
            )
        )
    }, [pools, search])
    const sortedPools = useMemo(() => {
        return [...filteredPools].sort((a, b) => {
            const aAddr = a.address.toLowerCase()
            const bAddr = b.address.toLowerCase()
            let cmp = 0
            switch (sortKey) {
                case 'tvl':
                    cmp = (tvlOf(aAddr) ?? 0) - (tvlOf(bAddr) ?? 0)
                    break
                case 'apr':
                    cmp = (aprOf(aAddr) ?? 0) - (aprOf(bAddr) ?? 0)
                    break
                case 'vol1d':
                    cmp = (volume1dOf(aAddr) ?? 0) - (volume1dOf(bAddr) ?? 0)
                    break
                case 'vol30d':
                    cmp = (volume30dOf(aAddr) ?? 0) - (volume30dOf(bAddr) ?? 0)
                    break
            }
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [filteredPools, sortKey, sortDir, tvlOf, aprOf, volume1dOf, volume30dOf])
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
    const header = (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold sm:text-xl">Liquidity Pools</h2>
            <div className="flex items-center gap-2">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search by token"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 rounded-2xl border border-input"
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={() => {
                        if (!isConnected) {
                            setIsConnectModalOpen(true)
                            return
                        }
                        onAddLiquidity()
                    }}
                >
                    <Plus />
                    New Position
                </Button>
            </div>
        </div>
    )
    if (isLoading) {
        return (
            <div className="space-y-4">
                {header}
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="py-3 px-4">Pool</TableHead>
                                <TableHead className="py-3 px-4">Fee Tier</TableHead>
                                <TableHead className="py-3 px-4">Price</TableHead>
                                <TableHead className="py-3 px-4">TVL</TableHead>
                                <TableHead className="py-3 px-4">APR</TableHead>
                                <TableHead className="py-3 px-4">1D Vol</TableHead>
                                <TableHead className="py-3 px-4">30D Vol</TableHead>
                                <TableHead className="py-3 px-4 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <LoadingState />
                    </Table>
                </Card>
            </div>
        )
    }
    if (pools.length === 0) {
        return (
            <div className="space-y-4">
                {header}
                <EmptyState
                    title="No pools available"
                    description="No pools available on this chain."
                />
            </div>
        )
    }
    return (
        <div className="space-y-4">
            {header}
            <PoolHighlights pools={pools} tvlOf={tvlOf} aprOf={aprOf} onSelect={onAddLiquidity} />
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="py-3 px-4">Pool</TableHead>
                            <TableHead className="py-3 px-4">Fee Tier</TableHead>
                            <TableHead className="py-3 px-4">Price</TableHead>
                            <SortableHeader
                                label="TVL"
                                columnKey="tvl"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                                className="py-3 px-4"
                            />
                            <SortableHeader
                                label="APR"
                                columnKey="apr"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                                className="py-3 px-4"
                            />
                            <SortableHeader
                                label="1D Vol"
                                columnKey="vol1d"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                                className="py-3 px-4"
                            />
                            <SortableHeader
                                label="30D Vol"
                                columnKey="vol30d"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                                className="py-3 px-4"
                            />
                            <TableHead className="py-3 px-4 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedPools.length === 0 ? (
                            <TableRow className="border-0">
                                <TableCell
                                    colSpan={8}
                                    className="p-6 text-center text-sm text-muted-foreground"
                                >
                                    No pools match &ldquo;{search}&rdquo;
                                </TableCell>
                            </TableRow>
                        ) : (
                            sortedPools.map((pool) => (
                                <PoolRow
                                    key={pool.address}
                                    pool={pool}
                                    tvlUsd={tvlOf(pool.address)}
                                    isLoadingTvl={isLoading}
                                    volume={{
                                        volume1d: volume1dOf(pool.address) ?? 0,
                                        volume30d: volume30dOf(pool.address) ?? 0,
                                    }}
                                    isLoadingVolume={isLoading}
                                    apr={aprOf(pool.address)}
                                    isLoadingApr={isLoading}
                                    onConnect={() => setIsConnectModalOpen(true)}
                                    onAddLiquidity={onAddLiquidity}
                                />
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>
            <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
        </div>
    )
}

export function PoolsList({ onAddLiquidity }: { onAddLiquidity: (pool?: V3PoolData) => void }) {
    const chainId = useChainId()
    const { pools, metricsByAddress, isLoading } = useAllPools(chainId)
    return (
        <PoolsListContent
            pools={pools}
            metricsByAddress={metricsByAddress}
            isLoading={isLoading}
            onAddLiquidity={onAddLiquidity}
        />
    )
}
