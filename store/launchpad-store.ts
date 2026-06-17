import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Address } from 'viem'
import type { LaunchpadSettings } from '@/types/launchpad'
import { DEFAULT_LAUNCHPAD_SETTINGS } from '@/types/launchpad'

interface LaunchpadStore {
    settings: LaunchpadSettings

    isCreateDialogOpen: boolean
    selectedTokenAddress: Address | null

    setIsCreateDialogOpen: (open: boolean) => void
    setSelectedTokenAddress: (addr: Address | null) => void
    setSlippageBps: (bps: number) => void
    reset: () => void
}

const initialState = {
    isCreateDialogOpen: false,
    selectedTokenAddress: null as Address | null,
}

export const useLaunchpadStore = create<LaunchpadStore>()(
    devtools(
        persist(
            (set) => ({
                ...initialState,
                settings: DEFAULT_LAUNCHPAD_SETTINGS,

                setIsCreateDialogOpen: (open) => set({ isCreateDialogOpen: open }),

                setSelectedTokenAddress: (addr) => set({ selectedTokenAddress: addr }),

                setSlippageBps: (bps) =>
                    set((state) => ({
                        settings: { ...state.settings, slippageBps: bps },
                    })),

                reset: () => set(initialState),
            }),
            {
                name: 'junoswap-launchpad-store',
                partialize: (state) => ({
                    settings: state.settings,
                }),
                merge: (persistedState, currentState) => {
                    const persisted = persistedState as Partial<LaunchpadStore>
                    return {
                        ...currentState,
                        settings: {
                            ...DEFAULT_LAUNCHPAD_SETTINGS,
                            ...persisted.settings,
                        },
                    }
                },
            }
        ),
        { name: 'junoswap-launchpad' }
    )
)
