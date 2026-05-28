import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { PointsSettings, PointsTimePeriod, PointsSortKey, SortDirection } from '@/types/points'

const DEFAULT_SETTINGS: PointsSettings = {
    timePeriod: 'all',
    sortKey: 'points',
    sortDirection: 'desc',
}

interface PointsStore {
    settings: PointsSettings
    page: number
    searchQuery: string
    setTimePeriod: (period: PointsTimePeriod) => void
    setSortKey: (key: PointsSortKey) => void
    setSortDirection: (dir: SortDirection) => void
    setPage: (page: number) => void
    setSearchQuery: (query: string) => void
}

export const usePointsStore = create<PointsStore>()(
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
                name: 'junoswap-points-store',
                partialize: (state) => ({ settings: state.settings }),
                merge: (persisted, current) => ({
                    ...current,
                    settings: {
                        ...DEFAULT_SETTINGS,
                        ...(persisted as { settings?: PointsSettings })?.settings,
                    },
                }),
            }
        ),
        { name: 'junoswap-points' }
    )
)

export const usePointsSettings = () => usePointsStore((state) => state.settings)
