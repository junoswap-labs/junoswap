'use client'

import { useChainId } from 'wagmi'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useNativeUsdPriceContext } from '@/components/launchpad/native-usd-price-provider'
import { useLeaderboardStore } from '@/store/leaderboard-store'
import { useLeaderboardTraders } from '@/hooks/useLeaderboardTraders'
import { useDebounce } from '@/hooks/useDebounce'
import { TimePeriodFilter } from './time-period-filter'
import { TraderLeaderboardTable } from './trader-leaderboard-table'
import { Search } from 'lucide-react'
import type { TraderSortKey } from '@/types/leaderboard'

export function LeaderboardContent() {
    const chainId = useChainId()
    const {
        settings,
        page,
        searchQuery,
        setTimePeriod,
        setSortKey,
        setSortDirection,
        setPage,
        setSearchQuery,
    } = useLeaderboardStore()
    const debouncedSearch = useDebounce(searchQuery, 300)
    const { nativeUsdPrice } = useNativeUsdPriceContext()

    const { traders, totalPages, isLoading } = useLeaderboardTraders(
        settings.timePeriod,
        settings.sortKey,
        settings.sortDirection,
        debouncedSearch,
        page,
        nativeUsdPrice
    )

    function handleSort(key: TraderSortKey) {
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
                    <h1 className="text-xl font-bold sm:text-2xl">Leaderboard</h1>
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search wallet address"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 rounded-2xl border border-input"
                        />
                    </div>
                </div>

                <TimePeriodFilter value={settings.timePeriod} onChange={setTimePeriod} />

                <Card>
                    <CardContent className="p-0">
                        <TraderLeaderboardTable
                            traders={traders}
                            totalPages={totalPages}
                            currentPage={page}
                            onPageChange={setPage}
                            nativeUsdPrice={nativeUsdPrice}
                            isLoading={isLoading}
                            sortKey={settings.sortKey}
                            sortDirection={settings.sortDirection}
                            onSort={handleSort}
                            chainId={chainId}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
