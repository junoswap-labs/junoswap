'use client'

import { useMemo, useRef, useCallback, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import type { RangeConfig, RangePreset } from '@/types/earn'
import { RANGE_PRESETS } from '@/types/earn'
import {
    getPresetRange,
    tickToPrice,
    priceToTick,
    nearestUsableTick,
    calculateRangePercentage,
    calculateSliderViewport,
} from '@/lib/liquidity-helpers'

const SLIDER_RESOLUTION = 10000

interface InteractiveRangeBarProps {
    currentTick: number
    tickSpacing: number
    decimals0: number
    decimals1: number
    token0Symbol: string
    token1Symbol: string
    config: RangeConfig
    onChange: (config: RangeConfig) => void
}

function EditablePrice({
    label,
    value,
    onChange,
}: {
    label: string
    value: string
    onChange: (val: string) => void
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    const inputRef = useRef<HTMLInputElement>(null)

    const startEditing = useCallback(() => {
        setDraft(value)
        setEditing(true)
        // Focus on next tick so the ref is attached
        requestAnimationFrame(() => inputRef.current?.select())
    }, [value])

    const commit = useCallback(() => {
        setEditing(false)
        if (draft && !isNaN(parseFloat(draft)) && draft !== value) {
            onChange(draft)
        }
    }, [draft, value, onChange])

    return (
        <div className={label === 'Max' ? 'text-right' : 'text-left'}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
            {editing ? (
                <input
                    ref={inputRef}
                    type="number"
                    step="any"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit()
                        if (e.key === 'Escape') setEditing(false)
                    }}
                    className="w-full bg-background/80 border border-border rounded px-1.5 py-0.5 text-xs font-mono tracking-tight outline-none focus:ring-1 focus:ring-ring"
                />
            ) : (
                <p
                    onClick={startEditing}
                    className="text-xs font-medium font-mono tracking-tight cursor-text hover:text-foreground transition-colors"
                    title="Click to edit"
                >
                    {value}
                </p>
            )}
        </div>
    )
}

function InteractiveRangeBar({
    currentTick,
    tickSpacing,
    decimals0,
    decimals1,
    token0Symbol,
    token1Symbol,
    config,
    onChange,
}: InteractiveRangeBarProps) {
    const isDraggingRef = useRef(false)
    const frozenViewportRef = useRef<{ lower: number; upper: number } | null>(null)

    // Viewport: the visible range of the slider track
    const viewport = useMemo(() => {
        if (isDraggingRef.current && frozenViewportRef.current) {
            return frozenViewportRef.current
        }
        const vp = calculateSliderViewport(config.tickLower, config.tickUpper, config.preset)
        frozenViewportRef.current = vp
        return vp
    }, [config.tickLower, config.tickUpper, config.preset])

    // Map ticks to slider positions (0-SLIDER_RESOLUTION)
    const [sliderLower, sliderUpper] = useMemo(() => {
        const span = viewport.upper - viewport.lower
        if (span <= 0) return [0, SLIDER_RESOLUTION]
        return [
            Math.round(((config.tickLower - viewport.lower) / span) * SLIDER_RESOLUTION),
            Math.round(((config.tickUpper - viewport.lower) / span) * SLIDER_RESOLUTION),
        ]
    }, [config.tickLower, config.tickUpper, viewport])

    // Current price marker position (%)
    const priceMarkerPct = useMemo(() => {
        const span = viewport.upper - viewport.lower
        if (span <= 0) return 50
        const pct = ((currentTick - viewport.lower) / span) * 100
        return Math.max(2, Math.min(98, pct))
    }, [currentTick, viewport])

    // Range percentage display
    const rangePercent = useMemo(() => {
        if (config.tickLower >= config.tickUpper) return null
        return calculateRangePercentage(currentTick, config.tickLower, config.tickUpper)
    }, [config.tickLower, config.tickUpper, currentTick])

    const handleSliderChange = useCallback(
        (values: number[]) => {
            const v0 = values[0] ?? 0
            const v1 = values[1] ?? SLIDER_RESOLUTION
            isDraggingRef.current = true

            const span = viewport.upper - viewport.lower
            const rawTickLower = viewport.lower + (v0 / SLIDER_RESOLUTION) * span
            const rawTickUpper = viewport.lower + (v1 / SLIDER_RESOLUTION) * span

            const snappedLower = nearestUsableTick(Math.round(rawTickLower), tickSpacing)
            let snappedUpper = nearestUsableTick(Math.round(rawTickUpper), tickSpacing)

            if (snappedUpper <= snappedLower) {
                snappedUpper = snappedLower + tickSpacing
            }

            const priceLower = tickToPrice(snappedLower, decimals0, decimals1)
            const priceUpper = tickToPrice(snappedUpper, decimals0, decimals1)

            onChange({
                preset: 'custom',
                tickLower: snappedLower,
                tickUpper: snappedUpper,
                priceLower,
                priceUpper,
            })
        },
        [viewport, tickSpacing, decimals0, decimals1, onChange]
    )

    const handleSliderCommit = useCallback(() => {
        isDraggingRef.current = false
        frozenViewportRef.current = null
    }, [])

    const handlePriceEdit = useCallback(
        (bound: 'lower' | 'upper', value: string) => {
            if (!value || isNaN(parseFloat(value))) return
            const tick = priceToTick(value, decimals0, decimals1)
            const alignedTick = nearestUsableTick(tick, tickSpacing)
            const alignedPrice = tickToPrice(alignedTick, decimals0, decimals1)
            if (bound === 'lower') {
                onChange({
                    ...config,
                    preset: 'custom',
                    tickLower: alignedTick,
                    priceLower: alignedPrice,
                })
            } else {
                onChange({
                    ...config,
                    preset: 'custom',
                    tickUpper: alignedTick,
                    priceUpper: alignedPrice,
                })
            }
        },
        [config, tickSpacing, decimals0, decimals1, onChange]
    )

    const currentPrice = useMemo(
        () => tickToPrice(currentTick, decimals0, decimals1),
        [currentTick, decimals0, decimals1]
    )

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted-foreground">Current Price</span>
                <span className="text-sm font-semibold font-mono tracking-tight">
                    {currentPrice}{' '}
                    <span className="text-muted-foreground font-normal">
                        {token1Symbol}/{token0Symbol}
                    </span>
                </span>
            </div>

            <div className="relative h-10 bg-muted/30 rounded-xl border border-border/30 px-3 flex items-center">
                <div className="relative w-full">
                    <Slider
                        value={[sliderLower, sliderUpper]}
                        onValueChange={handleSliderChange}
                        onValueCommit={handleSliderCommit}
                        min={0}
                        max={SLIDER_RESOLUTION}
                        step={1}
                    />
                    <div
                        className="absolute w-3 h-3 bg-primary rounded-full -top-[3px] shadow-sm ring-2 ring-primary/20 pointer-events-none z-10"
                        style={{
                            left: `${priceMarkerPct}%`,
                            transform: 'translateX(-50%)',
                        }}
                    />
                </div>
            </div>

            <div className="flex justify-between">
                <EditablePrice
                    label="Min"
                    value={config.priceLower}
                    onChange={(v) => handlePriceEdit('lower', v)}
                />
                {rangePercent !== null &&
                    Math.abs(rangePercent.lowerPercent) < 9999 &&
                    Math.abs(rangePercent.upperPercent) < 9999 && (
                        <div className="text-center">
                            <p className="text-[10px] text-foreground/60 font-medium">
                                {rangePercent.lowerPercent > 0
                                    ? `+${Math.abs(rangePercent.lowerPercent).toFixed(0)}%`
                                    : `-${Math.abs(rangePercent.lowerPercent).toFixed(0)}%`}{' '}
                                /{' '}
                                {rangePercent.upperPercent > 0
                                    ? `+${Math.abs(rangePercent.upperPercent).toFixed(0)}%`
                                    : `-${Math.abs(rangePercent.upperPercent).toFixed(0)}%`}
                            </p>
                        </div>
                    )}
                <EditablePrice
                    label="Max"
                    value={config.priceUpper}
                    onChange={(v) => handlePriceEdit('upper', v)}
                />
            </div>
        </div>
    )
}

interface RangeSelectorProps {
    currentTick: number
    tickSpacing: number
    decimals0: number
    decimals1: number
    token0Symbol: string
    token1Symbol: string
    config: RangeConfig
    onChange: (config: RangeConfig) => void
}

export function RangeSelector({
    currentTick,
    tickSpacing,
    decimals0,
    decimals1,
    token0Symbol,
    token1Symbol,
    config,
    onChange,
}: RangeSelectorProps) {
    const handlePresetSelect = (preset: RangePreset) => {
        const { tickLower, tickUpper } = getPresetRange(currentTick, tickSpacing, preset)
        const priceLower = tickToPrice(tickLower, decimals0, decimals1)
        const priceUpper = tickToPrice(tickUpper, decimals0, decimals1)
        onChange({
            preset,
            tickLower,
            tickUpper,
            priceLower,
            priceUpper,
        })
    }

    return (
        <div className="space-y-4">
            <div>
                <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider mb-2">
                    Price Range
                </p>
                <div className="flex gap-1.5">
                    {RANGE_PRESETS.filter((p) => p.value !== 'custom').map((preset) => {
                        const isActive = config.preset === preset.value
                        return (
                            <button
                                key={preset.value}
                                type="button"
                                onClick={() => handlePresetSelect(preset.value)}
                                className={`flex-1 px-2 py-1.5 rounded-lg border text-center transition-all duration-150 ${
                                    isActive
                                        ? 'bg-foreground/5 border-foreground/15 text-foreground'
                                        : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                }`}
                            >
                                <span
                                    className={`text-xs font-medium block ${isActive ? 'text-foreground' : ''}`}
                                >
                                    {preset.label}
                                </span>
                                {preset.tickRange != null && (
                                    <span className="text-[10px] opacity-50">
                                        ±{preset.tickRange}%
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {config.tickLower < config.tickUpper && (
                <InteractiveRangeBar
                    currentTick={currentTick}
                    tickSpacing={tickSpacing}
                    decimals0={decimals0}
                    decimals1={decimals1}
                    token0Symbol={token0Symbol}
                    token1Symbol={token1Symbol}
                    config={config}
                    onChange={onChange}
                />
            )}
        </div>
    )
}
