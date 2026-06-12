'use client'

import { useAccount, useChainId } from 'wagmi'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useNativeUsdPriceContext } from '@/components/launchpad/native-usd-price-provider'
import { usePointsStore } from '@/store/points-store'
import { usePointsData } from '@/hooks/usePointsData'
import { useDebounce } from '@/hooks/useDebounce'
import { ShareablePointsBanner } from './shareable-points-banner'
import { PointsLeaderboardTable } from './points-leaderboard-table'
import { Search } from 'lucide-react'
import type { PointsSortKey } from '@/types/points'

export function PointsContent() {
    const { settings, page, searchQuery, setSortKey, setSortDirection, setPage, setSearchQuery } =
        usePointsStore()
    const debouncedSearch = useDebounce(searchQuery, 300)
    const { nativeUsdPrice } = useNativeUsdPriceContext()
    const { address } = useAccount()
    const chainId = useChainId()

    const {
        traders,
        totalPages,
        totalCount,
        totalPointsAll,
        totalVolumeUsd,
        userSummary,
        isLoading,
    } = usePointsData(
        'all',
        settings.sortKey,
        settings.sortDirection,
        debouncedSearch,
        page,
        nativeUsdPrice
    )

    function handleSort(key: PointsSortKey) {
        if (settings.sortKey === key) {
            setSortDirection(settings.sortDirection === 'desc' ? 'asc' : 'desc')
        } else {
            setSortKey(key)
            setSortDirection('desc')
        }
    }

    return (
        <div className="flex min-h-screen items-start justify-center p-4 pt-8">
            <div className="w-full max-w-5xl space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-xl font-bold sm:text-2xl">Points</h1>
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search wallet address"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 rounded-lg border border-input bg-muted/30 focus-visible:ring-1 focus-visible:ring-primary/30"
                        />
                    </div>
                </div>

                <ShareablePointsBanner
                    address={address}
                    userSummary={userSummary}
                    totalPoints={totalPointsAll}
                    totalVolumeUsd={totalVolumeUsd}
                    totalTraders={totalCount}
                    isConnected={!!address}
                />

                <Card>
                    <CardContent className="p-0">
                        <PointsLeaderboardTable
                            traders={traders}
                            totalPages={totalPages}
                            currentPage={page}
                            onPageChange={setPage}
                            isLoading={isLoading}
                            sortKey={settings.sortKey}
                            sortDirection={settings.sortDirection}
                            onSort={handleSort}
                            userAddress={address}
                            chainId={chainId}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
