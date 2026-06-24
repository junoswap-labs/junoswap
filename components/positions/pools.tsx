'use client'

import { useMemo, useState } from 'react'
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
import { getDefaultPairTokens } from '@/lib/tokens'
import { getDisplayToken } from '@/services/tokens'
import { useCommonPools } from '@/hooks/usePools'
import { useGraduatedPools } from '@/hooks/useGraduatedPools'
import { useAllPools, PONDER_INDEXED_CHAINS } from '@/hooks/useAllPools'
import { usePoolTvl } from '@/hooks/usePoolTvl'
import { usePoolVolume } from '@/hooks/usePoolVolume'
import { formatFeeTier } from '@/lib/liquidity-helpers'
import { formatTvl, formatApr, calculateApr } from '@/lib/format'
import type { V3PoolData } from '@/types/earn'
import type { Token } from '@/types/tokens'

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

    // Ensure stable/native displays second; native+stable pair shows NATIVE / STABLE
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

function PoolsListContent({
    pools,
    isLoading,
    onAddLiquidity,
}: {
    pools: V3PoolData[]
    isLoading: boolean
    onAddLiquidity: (pool: V3PoolData) => void
}) {
    const chainId = useChainId()
    const { tvlByAddress, isLoading: isLoadingTvl } = usePoolTvl(pools, chainId)
    const { volumeByAddress, isLoading: isLoadingVol } = usePoolVolume(pools, chainId)
    const aprByAddress = useMemo(() => {
        const result: Record<string, number | null> = {}
        for (const pool of pools) {
            const addr = pool.address.toLowerCase()
            const tvl = tvlByAddress[addr]
            const volume = volumeByAddress[addr]
            result[addr] = calculateApr(pool.fee, tvl ?? 0, volume?.volume30d ?? 0)
        }
        return result
    }, [pools, tvlByAddress, volumeByAddress])
    const isLoadingApr = isLoadingTvl || isLoadingVol
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
                    cmp = (tvlByAddress[aAddr] ?? 0) - (tvlByAddress[bAddr] ?? 0)
                    break
                case 'apr':
                    cmp = (aprByAddress[aAddr] ?? 0) - (aprByAddress[bAddr] ?? 0)
                    break
                case 'vol1d':
                    cmp =
                        (volumeByAddress[aAddr]?.volume1d ?? 0) -
                        (volumeByAddress[bAddr]?.volume1d ?? 0)
                    break
                case 'vol30d':
                    cmp =
                        (volumeByAddress[aAddr]?.volume30d ?? 0) -
                        (volumeByAddress[bAddr]?.volume30d ?? 0)
                    break
            }
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [filteredPools, sortKey, sortDir, tvlByAddress, aprByAddress, volumeByAddress])
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
    const header = (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold sm:text-xl">Liquidity Pools</h2>
            <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search by token"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 rounded-2xl border border-input"
                />
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
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="py-3 px-4">Pool</TableHead>
                            <TableHead className="py-3 px-4">Fee Tier</TableHead>
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
                                    colSpan={7}
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
                                    tvlUsd={tvlByAddress[pool.address.toLowerCase()] ?? null}
                                    isLoadingTvl={isLoadingTvl}
                                    volume={volumeByAddress[pool.address.toLowerCase()] ?? null}
                                    isLoadingVolume={isLoadingVol}
                                    apr={aprByAddress[pool.address.toLowerCase()] ?? null}
                                    isLoadingApr={isLoadingApr}
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

function PoolsListPonder({
    chainId,
    onAddLiquidity,
}: {
    chainId: number
    onAddLiquidity: (pool: V3PoolData) => void
}) {
    const { pools, isLoading } = useAllPools(chainId)
    return <PoolsListContent pools={pools} isLoading={isLoading} onAddLiquidity={onAddLiquidity} />
}

function PoolsListLegacy({
    chainId,
    onAddLiquidity,
}: {
    chainId: number
    onAddLiquidity: (pool: V3PoolData) => void
}) {
    const { pools: commonPools, isLoading: isLoadingCommon } = useCommonPools(chainId)
    const { pools: graduatedPools, isLoading: isLoadingGraduated } = useGraduatedPools(chainId)
    const pools = useMemo(() => {
        const unique = new Map<string, V3PoolData>()
        ;[...commonPools, ...graduatedPools].forEach((p) => unique.set(p.address, p))
        return Array.from(unique.values())
    }, [commonPools, graduatedPools])
    return (
        <PoolsListContent
            pools={pools}
            isLoading={isLoadingCommon || isLoadingGraduated}
            onAddLiquidity={onAddLiquidity}
        />
    )
}

export function PoolsList({ onAddLiquidity }: { onAddLiquidity: (pool: V3PoolData) => void }) {
    const chainId = useChainId()
    if (PONDER_INDEXED_CHAINS.has(chainId)) {
        return <PoolsListPonder chainId={chainId} onAddLiquidity={onAddLiquidity} />
    }
    return <PoolsListLegacy chainId={chainId} onAddLiquidity={onAddLiquidity} />
}
