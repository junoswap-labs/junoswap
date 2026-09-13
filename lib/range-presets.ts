import { MAX_TICK, MIN_TICK, getFullRange, snapTickRange, type TickRange } from '@/lib/tick-math'

const TICK_BASE = 1.0001
const VIEWPORT_HALF_SPAN = Math.ceil(6050 * 1.2)

export type RangePreset = 'full' | 'safe' | 'common' | 'narrow' | 'custom'

export interface RangePresetConfig {
    label: string
    value: RangePreset
    description: string
    tickRange?: number // Percentage of ticks from current (e.g., 50 means ±50% from current)
}

export interface RangePercentages {
    lowerPercent: number
    upperPercent: number
}

export const RANGE_PRESETS: RangePresetConfig[] = [
    {
        label: 'Full Range',
        value: 'full',
        description: 'Earn fees at any price (like V2)',
    },
    {
        label: 'Safe',
        value: 'safe',
        description: '±50% from current price',
        tickRange: 50,
    },
    {
        label: 'Common',
        value: 'common',
        description: '±20% from current price',
        tickRange: 20,
    },
    {
        label: 'Narrow',
        value: 'narrow',
        description: '±5% for stable pairs',
        tickRange: 5,
    },
    {
        label: 'Custom',
        value: 'custom',
        description: 'Set your own range',
    },
]

// Derived from the percentages above so the copy and the math cannot drift apart.
export const DELTA_BY_PRESET = new Map<RangePreset, number>(
    RANGE_PRESETS.flatMap(({ value, tickRange }) =>
        tickRange === undefined
            ? []
            : [[value, Math.round(Math.log(1 + tickRange / 100) / Math.log(TICK_BASE))] as const]
    )
)

export function getPresetTickRange(
    preset: RangePreset,
    currentTick: number,
    tickSpacing: number
): TickRange {
    if (preset === 'full') return getFullRange(tickSpacing)

    const delta = DELTA_BY_PRESET.get(preset)
    if (delta === undefined) {
        const collapsed = snapTickRange(currentTick, currentTick, tickSpacing).tickLower
        return { tickLower: collapsed, tickUpper: collapsed }
    }

    return snapTickRange(currentTick - delta, currentTick + delta, tickSpacing)
}

export function getRangePercentages(
    currentTick: number,
    tickLower: number,
    tickUpper: number
): RangePercentages {
    return {
        lowerPercent: (Math.pow(TICK_BASE, tickLower - currentTick) - 1) * 100,
        upperPercent: (Math.pow(TICK_BASE, tickUpper - currentTick) - 1) * 100,
    }
}

export function getRangeViewport(
    tickLower: number,
    tickUpper: number,
    preset: RangePreset
): TickRange {
    if (preset === 'full') return { tickLower: MIN_TICK, tickUpper: MAX_TICK }
    const midTick = (tickLower + tickUpper) / 2
    return {
        tickLower: Math.max(Math.floor(midTick - VIEWPORT_HALF_SPAN), MIN_TICK),
        tickUpper: Math.min(Math.ceil(midTick + VIEWPORT_HALF_SPAN), MAX_TICK),
    }
}
