import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Token } from '@/types/tokens'
import type {
    V3PoolData,
    PositionWithTokens,
    RangeConfig,
    RangePreset,
    EarnSettings,
    Incentive,
    StakedPosition,
    MiningSettings,
} from '@/types/earn'
import { DEFAULT_EARN_SETTINGS, DEFAULT_RANGE_CONFIG, DEFAULT_MINING_SETTINGS } from '@/types/earn'
import { getPresetRange, tickToPrice } from '@/lib/liquidity-helpers'

interface EarnStore {
    selectedPool: V3PoolData | null
    selectedPosition: PositionWithTokens | null
    rangeConfig: RangeConfig
    token0: Token | null
    token1: Token | null
    fee: number

    isAddLiquidityOpen: boolean
    isRemoveLiquidityOpen: boolean
    isCollectFeesOpen: boolean
    isPositionDetailsOpen: boolean
    isIncreaseLiquidityOpen: boolean

    selectedIncentive: Incentive | null
    selectedStakedPosition: StakedPosition | null
    isStakeDialogOpen: boolean
    isUnstakeDialogOpen: boolean

    settings: EarnSettings
    miningSettings: MiningSettings

    activeTab: 'pools' | 'positions'

    setSelectedPool: (pool: V3PoolData | null) => void
    setSelectedPosition: (position: PositionWithTokens | null) => void
    setRangeConfig: (config: RangeConfig) => void
    setRangePreset: (preset: RangePreset, currentTick: number, tickSpacing: number) => void
    setToken0: (token: Token | null) => void
    setToken1: (token: Token | null) => void
    setFee: (fee: number) => void
    setActiveTab: (tab: 'pools' | 'positions') => void

    openAddLiquidity: (pool?: V3PoolData) => void
    closeAddLiquidity: () => void
    openRemoveLiquidity: (position: PositionWithTokens) => void
    closeRemoveLiquidity: () => void
    openCollectFees: (position: PositionWithTokens) => void
    closeCollectFees: () => void
    openPositionDetails: (position: PositionWithTokens) => void
    closePositionDetails: () => void
    openIncreaseLiquidity: (position: PositionWithTokens) => void
    closeIncreaseLiquidity: () => void

    openStakeDialog: (incentive: Incentive) => void
    closeStakeDialog: () => void
    openUnstakeDialog: (stakedPosition: StakedPosition) => void
    closeUnstakeDialog: () => void

    setDefaultSlippage: (slippage: number) => void
    setDefaultDeadline: (minutes: number) => void
    setHideClosedPositions: (hide: boolean) => void
    setShowAllPools: (show: boolean) => void
    setHideEndedIncentives: (hide: boolean) => void

    reset: () => void
    resetTokenSelection: () => void
}

const initialState = {
    selectedPool: null,
    selectedPosition: null,
    rangeConfig: DEFAULT_RANGE_CONFIG,
    token0: null,
    token1: null,
    fee: 3000,
    isAddLiquidityOpen: false,
    isRemoveLiquidityOpen: false,
    isCollectFeesOpen: false,
    isPositionDetailsOpen: false,
    isIncreaseLiquidityOpen: false,
    selectedIncentive: null,
    selectedStakedPosition: null,
    isStakeDialogOpen: false,
    isUnstakeDialogOpen: false,
    activeTab: 'pools' as const,
}

export const useEarnStore = create<EarnStore>()(
    devtools(
        persist(
            (set, get) => ({
                ...initialState,
                settings: DEFAULT_EARN_SETTINGS,
                miningSettings: DEFAULT_MINING_SETTINGS,

                setSelectedPool: (pool) => set({ selectedPool: pool }),

                setSelectedPosition: (position) => set({ selectedPosition: position }),

                setRangeConfig: (config) => set({ rangeConfig: config }),

                setRangePreset: (preset, currentTick, tickSpacing) => {
                    const { tickLower, tickUpper } = getPresetRange(
                        currentTick,
                        tickSpacing,
                        preset
                    )
                    const { selectedPool } = get()

                    let priceLower = '0'
                    let priceUpper = '0'

                    if (selectedPool) {
                        const decimals0 = selectedPool.token0.decimals
                        const decimals1 = selectedPool.token1.decimals
                        priceLower = tickToPrice(tickLower, decimals0, decimals1)
                        priceUpper = tickToPrice(tickUpper, decimals0, decimals1)
                    }

                    set({
                        rangeConfig: {
                            preset,
                            tickLower,
                            tickUpper,
                            priceLower,
                            priceUpper,
                        },
                    })
                },

                setToken0: (token) => set({ token0: token }),
                setToken1: (token) => set({ token1: token }),
                setFee: (fee) => set({ fee }),

                setActiveTab: (tab) => set({ activeTab: tab }),

                openAddLiquidity: (pool) => {
                    const updates: Partial<EarnStore> = { isAddLiquidityOpen: true }

                    if (pool) {
                        updates.selectedPool = pool
                        updates.token0 = pool.token0
                        updates.token1 = pool.token1
                        updates.fee = pool.fee

                        const { tickLower, tickUpper } = getPresetRange(
                            pool.tick,
                            pool.tickSpacing,
                            'common'
                        )
                        updates.rangeConfig = {
                            preset: 'common',
                            tickLower,
                            tickUpper,
                            priceLower: tickToPrice(
                                tickLower,
                                pool.token0.decimals,
                                pool.token1.decimals
                            ),
                            priceUpper: tickToPrice(
                                tickUpper,
                                pool.token0.decimals,
                                pool.token1.decimals
                            ),
                        }
                    }

                    set(updates)
                },

                closeAddLiquidity: () =>
                    set({
                        isAddLiquidityOpen: false,
                        selectedPool: null,
                        token0: null,
                        token1: null,
                        rangeConfig: DEFAULT_RANGE_CONFIG,
                    }),

                openRemoveLiquidity: (position) =>
                    set({
                        isRemoveLiquidityOpen: true,
                        selectedPosition: position,
                    }),

                closeRemoveLiquidity: () =>
                    set({
                        isRemoveLiquidityOpen: false,
                        selectedPosition: null,
                    }),

                openCollectFees: (position) =>
                    set({
                        isCollectFeesOpen: true,
                        selectedPosition: position,
                    }),

                closeCollectFees: () =>
                    set({
                        isCollectFeesOpen: false,
                        selectedPosition: null,
                    }),

                openPositionDetails: (position) =>
                    set({
                        isPositionDetailsOpen: true,
                        selectedPosition: position,
                    }),

                closePositionDetails: () =>
                    set({
                        isPositionDetailsOpen: false,
                        selectedPosition: null,
                    }),

                openIncreaseLiquidity: (position) =>
                    set({
                        isIncreaseLiquidityOpen: true,
                        selectedPosition: position,
                    }),

                closeIncreaseLiquidity: () =>
                    set({
                        isIncreaseLiquidityOpen: false,
                        selectedPosition: null,
                    }),

                openStakeDialog: (incentive) =>
                    set({
                        isStakeDialogOpen: true,
                        selectedIncentive: incentive,
                    }),

                closeStakeDialog: () =>
                    set({
                        isStakeDialogOpen: false,
                        selectedIncentive: null,
                    }),

                openUnstakeDialog: (stakedPosition) =>
                    set({
                        isUnstakeDialogOpen: true,
                        selectedStakedPosition: stakedPosition,
                    }),

                closeUnstakeDialog: () =>
                    set({
                        isUnstakeDialogOpen: false,
                        selectedStakedPosition: null,
                    }),

                setDefaultSlippage: (slippage) =>
                    set((state) => ({
                        settings: { ...state.settings, defaultSlippage: slippage },
                    })),

                setDefaultDeadline: (minutes) =>
                    set((state) => ({
                        settings: { ...state.settings, defaultDeadlineMinutes: minutes },
                    })),

                setHideClosedPositions: (hide) =>
                    set((state) => ({
                        settings: { ...state.settings, hideClosedPositions: hide },
                    })),

                setShowAllPools: (show) =>
                    set((state) => ({
                        settings: { ...state.settings, showAllPools: show },
                    })),

                setHideEndedIncentives: (hide) =>
                    set((state) => ({
                        miningSettings: { ...state.miningSettings, hideEndedIncentives: hide },
                    })),

                reset: () => set({ ...initialState }),

                resetTokenSelection: () =>
                    set({
                        token0: null,
                        token1: null,
                        fee: 3000,
                        rangeConfig: DEFAULT_RANGE_CONFIG,
                    }),
            }),
            {
                name: 'junoswap-earn-store',
                partialize: (state) => ({
                    settings: state.settings,
                    miningSettings: state.miningSettings,
                }),
                merge: (persisted, current) => ({
                    ...current,
                    settings: {
                        ...DEFAULT_EARN_SETTINGS,
                        ...(persisted as { settings?: EarnSettings })?.settings,
                    },
                    miningSettings: {
                        ...DEFAULT_MINING_SETTINGS,
                        ...(persisted as { miningSettings?: MiningSettings })?.miningSettings,
                    },
                }),
            }
        ),
        { name: 'junoswap-earn' }
    )
)

export const useEarnSettings = () => useEarnStore((state) => state.settings)
export const useMiningSettings = () => useEarnStore((state) => state.miningSettings)
export const useSelectedPosition = () => useEarnStore((state) => state.selectedPosition)
export const useSelectedIncentive = () => useEarnStore((state) => state.selectedIncentive)
export const useSelectedStakedPosition = () => useEarnStore((state) => state.selectedStakedPosition)
export const useRangeConfig = () => useEarnStore((state) => state.rangeConfig)
export const useActiveTab = () => useEarnStore((state) => state.activeTab)
