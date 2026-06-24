'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

/**
 * Calculate visual positions for the price range bar.
 * The bar track extends 10% beyond the position range on each side so the
 * range segment never touches the edges. Returns CSS left/right percentages
 * for the range segment and marker.
 */
function useRangeBarLayout(
    currentTick: number,
    tickLower: number,
    tickUpper: number
): { rangeLeft: string; rangeRight: string; markerLeft: string; markerVisible: boolean } {
    return useMemo(() => {
        const tickRange = tickUpper - tickLower
        if (tickRange <= 0) {
            return { rangeLeft: '0%', rangeRight: '0%', markerLeft: '50%', markerVisible: false }
        }
        // Normalize: 0 = tickLower, 1 = tickUpper
        const normalizedCurrent = (currentTick - tickLower) / tickRange

        // Track extends 10% beyond range on each side (mapped to 0-1 normalized space)
        const padding = 0.1
        const trackMin = -padding
        const trackMax = 1 + padding
        const trackSpan = trackMax - trackMin

        // Position of range bounds relative to padded track (as percentage)
        const rangeLeftPct = ((0 - trackMin) / trackSpan) * 100
        const rangeRightPct = ((1 - trackMin) / trackSpan) * 100

        // Position of current tick on padded track
        const markerPct = ((normalizedCurrent - trackMin) / trackSpan) * 100

        // Marker is visible if it falls within the track
        const markerVisible = markerPct >= 0 && markerPct <= 100

        // Clamp marker to track bounds
        const clampedMarkerPct = Math.max(2, Math.min(98, markerPct))

        return {
            rangeLeft: `${rangeLeftPct}%`,
            rangeRight: `${100 - rangeRightPct}%`,
            markerLeft: `${clampedMarkerPct}%`,
            markerVisible,
        }
    }, [currentTick, tickLower, tickUpper])
}

interface PriceRangeBarProps {
    tickLower: number
    tickUpper: number
    currentTick: number
    inRange: boolean
    className?: string
    /** Tailwind bg class for the active range segment. Defaults to semantic positive/negative. */
    segmentInRangeClassName?: string
    segmentOutRangeClassName?: string
}

export function PriceRangeBar({
    tickLower,
    tickUpper,
    currentTick,
    inRange,
    className,
    segmentInRangeClassName = 'bg-positive',
    segmentOutRangeClassName = 'bg-negative',
}: PriceRangeBarProps) {
    const layout = useRangeBarLayout(currentTick, tickLower, tickUpper)
    return (
        <div className={cn('h-2 bg-muted rounded-full relative', className)}>
            <div
                className={cn(
                    'absolute h-full rounded-full',
                    inRange ? segmentInRangeClassName : segmentOutRangeClassName
                )}
                style={{ left: layout.rangeLeft, right: layout.rangeRight }}
            />
            {layout.markerVisible && (
                <div
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-2 ring-foreground shadow-sm"
                    style={{ left: layout.markerLeft }}
                />
            )}
        </div>
    )
}
