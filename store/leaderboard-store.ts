import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type {
    LeaderboardSettings,
    LeaderboardTimePeriod,
    TraderSortKey,
    SortDirection,
} from '@/types/leaderboard'

const DEFAULT_SETTINGS: LeaderboardSettings = {
    timePeriod: 'all',
    sortKey: 'netWorth',
    sortDirection: 'desc',
}

interface LeaderboardStore {
    settings: LeaderboardSettings
    page: number
    searchQuery: string
    setTimePeriod: (period: LeaderboardTimePeriod) => void
    setSortKey: (key: TraderSortKey) => void
    setSortDirection: (dir: SortDirection) => void
    setPage: (page: number) => void
    setSearchQuery: (query: string) => void
}

export const useLeaderboardStore = create<LeaderboardStore>()(
    devtools(
        persist(
            (set) => ({
                settings: DEFAULT_SETTINGS,
                page: 1,
                searchQuery: '',

                setTimePeriod: (period) =>
                    set((state) => ({
                        settings: { ...state.settings, timePeriod: period },
                        page: 1,
                    })),

                setSortKey: (key) =>
                    set((state) => ({
                        settings: { ...state.settings, sortKey: key },
                        page: 1,
                    })),

                setSortDirection: (dir) =>
                    set((state) => ({
                        settings: { ...state.settings, sortDirection: dir },
                    })),

                setPage: (page) => set({ page }),
                setSearchQuery: (query) => set({ searchQuery: query, page: 1 }),
            }),
            {
                name: 'junoswap-leaderboard-store',
                partialize: (state) => ({ settings: state.settings }),
                merge: (persisted, current) => ({
                    ...current,
                    settings: {
                        ...DEFAULT_SETTINGS,
                        ...(persisted as { settings?: LeaderboardSettings })?.settings,
                    },
                }),
            }
        ),
        { name: 'junoswap-leaderboard' }
    )
)
