import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { PortfolioSettings, PortfolioSortKey, SortDirection } from '@/types/portfolio'

const DEFAULT_SETTINGS: PortfolioSettings = {
    sortBy: 'value',
    sortDirection: 'desc',
    hideSmallBalances: false,
    smallBalanceThreshold: 1,
}

interface PortfolioStore {
    settings: PortfolioSettings
    activeTab: 'holdings' | 'activity'
    setSortBy: (key: PortfolioSortKey) => void
    setSortDirection: (dir: SortDirection) => void
    setActiveTab: (tab: 'holdings' | 'activity') => void
}

export const usePortfolioStore = create<PortfolioStore>()(
    devtools(
        persist(
            (set) => ({
                settings: DEFAULT_SETTINGS,
                activeTab: 'holdings' as const,

                setSortBy: (key) =>
                    set((state) => ({
                        settings: { ...state.settings, sortBy: key },
                    })),

                setSortDirection: (dir) =>
                    set((state) => ({
                        settings: { ...state.settings, sortDirection: dir },
                    })),

                setActiveTab: (tab) => set({ activeTab: tab }),
            }),
            {
                name: 'junoswap-portfolio-store',
                partialize: (state) => ({ settings: state.settings }),
                merge: (persisted, current) => ({
                    ...current,
                    settings: {
                        ...DEFAULT_SETTINGS,
                        ...(persisted as { settings?: PortfolioSettings })?.settings,
                    },
                }),
            }
        ),
        { name: 'junoswap-portfolio' }
    )
)
