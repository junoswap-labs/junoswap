'use client'

import { useMemo, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Layers, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
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
import { TOKEN_LISTS, getDefaultPairTokens } from '@/lib/tokens'
import { usePoolsForPair } from '@/hooks/usePools'
import { usePoolTvl } from '@/hooks/usePoolTvl'
import { usePoolVolume } from '@/hooks/usePoolVolume'
import { useEarnStore } from '@/store/earn-store'
import { formatFeeTier } from '@/lib/liquidity-helpers'
import type { V3PoolData } from '@/types/earn'
import type { Token } from '@/types/tokens'

function formatTvl(tvlUsd: number): string {
    if (tvlUsd <= 0) return '$0.00'
    if (tvlUsd >= 1_000_000) return `$${(tvlUsd / 1_000_000).toFixed(2)}M`
    if (tvlUsd >= 1_000) return `$${(tvlUsd / 1_000).toFixed(2)}K`
    return `$${tvlUsd.toFixed(2)}`
}

function PoolRow({
    pool,
    tvlUsd,
    isLoadingTvl,
    volume,
    isLoadingVolume,
    onConnect,
}: {
    pool: V3PoolData
    tvlUsd: number | null
    isLoadingTvl: boolean
    volume: { volume1d: number; volume30d: number } | null
    isLoadingVolume: boolean
    onConnect: () => void
}) {
    const { isConnected } = useAccount()
    const chainId = useChainId()
    const { openAddLiquidity } = useEarnStore()

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
    return (
        <TableRow className="border-0">
            <TableCell className="p-3">
                <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                        <Avatar className="h-8 w-8 shrink-0 border-2 border-background">
                            <AvatarImage src={display0.logo} alt={display0.symbol} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {display0.symbol.slice(0, 2)}
                            </AvatarFallback>
                        </Avatar>
                        <Avatar className="h-8 w-8 shrink-0 border-2 border-background">
                            <AvatarImage src={display1.logo} alt={display1.symbol} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {display1.symbol.slice(0, 2)}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <span className="font-medium">
                        {display0.symbol} / {display1.symbol}
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
                        openAddLiquidity(pool)
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
                                <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                                <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
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
                        <div className="h-8 w-20 bg-muted rounded animate-pulse ml-auto" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    )
}

function useCommonPools(chainId: number): { pools: V3PoolData[]; isLoading: boolean } {
    const tokens = TOKEN_LISTS[chainId] ?? []
    // Get first 6 tokens to check pools (always use fixed number for stable hook count)
    const t0 = tokens[0] as Token | null
    const t1 = tokens[1] as Token | null
    const t2 = tokens[2] as Token | null
    const t3 = tokens[3] as Token | null
    const t4 = tokens[4] as Token | null
    const t5 = tokens[5] as Token | null

    // Call constant number of hooks (15 pairs for 6 tokens)
    const p01 = usePoolsForPair(t0, t1, chainId)
    const p02 = usePoolsForPair(t0, t2, chainId)
    const p03 = usePoolsForPair(t0, t3, chainId)
    const p04 = usePoolsForPair(t0, t4, chainId)
    const p05 = usePoolsForPair(t0, t5, chainId)
    const p12 = usePoolsForPair(t1, t2, chainId)
    const p13 = usePoolsForPair(t1, t3, chainId)
    const p14 = usePoolsForPair(t1, t4, chainId)
    const p15 = usePoolsForPair(t1, t5, chainId)
    const p23 = usePoolsForPair(t2, t3, chainId)
    const p24 = usePoolsForPair(t2, t4, chainId)
    const p25 = usePoolsForPair(t2, t5, chainId)
    const p34 = usePoolsForPair(t3, t4, chainId)
    const p35 = usePoolsForPair(t3, t5, chainId)
    const p45 = usePoolsForPair(t4, t5, chainId)

    const poolResults = useMemo(
        () => [p01, p02, p03, p04, p05, p12, p13, p14, p15, p23, p24, p25, p34, p35, p45],
        [p01, p02, p03, p04, p05, p12, p13, p14, p15, p23, p24, p25, p34, p35, p45]
    )

    const allPools = useMemo(() => {
        const combined = poolResults.flatMap((r) => r.pools)
        const unique = new Map<string, V3PoolData>()
        combined.forEach((pool) => {
            unique.set(pool.address, pool)
        })
        return Array.from(unique.values())
    }, [poolResults])
    const isLoading = poolResults.some((r) => r.isLoading)
    return {
        pools: allPools,
        isLoading,
    }
}

export function PoolsList() {
    const chainId = useChainId()
    const { pools, isLoading } = useCommonPools(chainId)
    const { tvlByAddress, isLoading: isLoadingTvl } = usePoolTvl(pools, chainId)
    const { volumeByAddress, isLoading: isLoadingVol } = usePoolVolume(pools, chainId)
    const sortedPools = useMemo(() => {
        return [...pools].sort((a, b) => {
            const aTvl = tvlByAddress[a.address.toLowerCase()] ?? 0
            const bTvl = tvlByAddress[b.address.toLowerCase()] ?? 0
            return bTvl - aTvl
        })
    }, [pools, tvlByAddress])
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
    if (isLoading) {
        return (
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="py-3 px-4">Pool</TableHead>
                            <TableHead className="py-3 px-4">Fee Tier</TableHead>
                            <TableHead className="py-3 px-4">TVL</TableHead>
                            <TableHead className="py-3 px-4">1D Vol</TableHead>
                            <TableHead className="py-3 px-4">30D Vol</TableHead>
                            <TableHead className="py-3 px-4 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <LoadingState />
                </Table>
            </Card>
        )
    }
    if (pools.length === 0) {
        return (
            <EmptyState
                icon={Layers}
                title="No pools available"
                description="No pools available on this chain."
            />
        )
    }
    return (
        <>
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="py-3 px-4">Pool</TableHead>
                            <TableHead className="py-3 px-4">Fee Tier</TableHead>
                            <TableHead className="py-3 px-4">TVL</TableHead>
                            <TableHead className="py-3 px-4">1D Vol</TableHead>
                            <TableHead className="py-3 px-4">30D Vol</TableHead>
                            <TableHead className="py-3 px-4 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedPools.map((pool) => (
                            <PoolRow
                                key={pool.address}
                                pool={pool}
                                tvlUsd={tvlByAddress[pool.address.toLowerCase()] ?? null}
                                isLoadingTvl={isLoadingTvl}
                                volume={volumeByAddress[pool.address.toLowerCase()] ?? null}
                                isLoadingVolume={isLoadingVol}
                                onConnect={() => setIsConnectModalOpen(true)}
                            />
                        ))}
                    </TableBody>
                </Table>
            </Card>
            <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
        </>
    )
}
