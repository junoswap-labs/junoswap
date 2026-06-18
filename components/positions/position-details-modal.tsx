'use client'

import { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { usePositionValue } from '@/hooks/usePositionValue'
import type { PositionWithTokens } from '@/types/earn'

/**
 * Calculate visual positions for the price range bar.
 * The bar track extends 10% beyond the position range on each side.
 * Returns CSS left/right percentages for the range segment and marker.
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

interface PositionDetailsModalProps {
    open: boolean
    position: PositionWithTokens | null
    onClose: () => void
    onCollectFees: (position: PositionWithTokens) => void
    onRemoveLiquidity: (position: PositionWithTokens) => void
    onIncreaseLiquidity: (position: PositionWithTokens) => void
}

export function PositionDetailsModal({
    open,
    position: selectedPosition,
    onClose,
    onCollectFees,
    onRemoveLiquidity,
    onIncreaseLiquidity,
}: PositionDetailsModalProps) {
    const {
        amount0Formatted,
        amount1Formatted,
        fees0Formatted,
        fees1Formatted,
        inRange,
        currentPrice,
        priceLower,
        priceUpper,
        currentTick,
    } = usePositionValue(selectedPosition)
    const rangeBar = useRangeBarLayout(
        currentTick,
        selectedPosition?.tickLower ?? 0,
        selectedPosition?.tickUpper ?? 0
    )
    if (!selectedPosition) return null
    const hasFees = selectedPosition.tokensOwed0 > 0n || selectedPosition.tokensOwed1 > 0n
    const isClosed = selectedPosition.liquidity === 0n
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <DialogTitle className="text-lg">
                            {selectedPosition.token0Info.symbol} /{' '}
                            {selectedPosition.token1Info.symbol}
                        </DialogTitle>
                        <Badge variant="outline" className="text-xs">
                            {(selectedPosition.fee / 10000).toFixed(2)}%
                        </Badge>
                        {isClosed ? (
                            <Badge variant="secondary">Closed</Badge>
                        ) : inRange ? (
                            <Badge
                                variant="outline"
                                className="bg-positive/15 text-positive border-positive/25"
                            >
                                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-positive" />
                                In Range
                            </Badge>
                        ) : (
                            <Badge
                                variant="outline"
                                className="bg-amber-500/15 text-amber-400 border-amber-500/25"
                            >
                                Out of Range
                            </Badge>
                        )}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                        Position #{selectedPosition.tokenId.toString()}
                    </div>
                </DialogHeader>
                <div className="space-y-0">
                    <Card>
                        <CardContent className="p-0">
                            {/* Liquidity Section */}
                            <div className="p-4 space-y-3">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Liquidity
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm">
                                            {selectedPosition.token0Info.symbol}
                                        </span>
                                        <span className="text-sm font-medium font-mono tracking-tight">
                                            {amount0Formatted}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm">
                                            {selectedPosition.token1Info.symbol}
                                        </span>
                                        <span className="text-sm font-medium font-mono tracking-tight">
                                            {amount1Formatted}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Fees Section */}
                            <div className="p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Uncollected Fees
                                    </div>
                                    {hasFees && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs transition-colors"
                                            onClick={() => {
                                                onClose()
                                                onCollectFees(selectedPosition)
                                            }}
                                        >
                                            Collect
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm">
                                            {selectedPosition.token0Info.symbol}
                                        </span>
                                        <span
                                            className={`text-sm font-medium font-mono tracking-tight ${hasFees ? 'text-positive' : ''}`}
                                        >
                                            {fees0Formatted}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm">
                                            {selectedPosition.token1Info.symbol}
                                        </span>
                                        <span
                                            className={`text-sm font-medium font-mono tracking-tight ${hasFees ? 'text-positive' : ''}`}
                                        >
                                            {fees1Formatted}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Price Range Section */}
                            <div className="p-4 space-y-3">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Price Range
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div>
                                        <div className="text-xs text-muted-foreground">Min</div>
                                        <div className="text-sm font-medium font-mono tracking-tight">
                                            {priceLower}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Current</div>
                                        <div className="text-sm font-medium font-mono tracking-tight text-primary">
                                            {currentPrice}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Max</div>
                                        <div className="text-sm font-medium font-mono tracking-tight">
                                            {priceUpper}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground text-center">
                                    {selectedPosition.token1Info.symbol} per{' '}
                                    {selectedPosition.token0Info.symbol}
                                </div>
                                <div className="h-2 bg-muted rounded-full relative">
                                    <div
                                        className={`absolute h-full rounded-full ${inRange ? 'bg-primary' : 'bg-amber-400'}`}
                                        style={{
                                            left: rangeBar.rangeLeft,
                                            right: rangeBar.rangeRight,
                                        }}
                                    />
                                    {rangeBar.markerVisible && (
                                        <div
                                            className="absolute w-1 h-5 bg-foreground rounded-full -top-[3px]"
                                            style={{
                                                left: rangeBar.markerLeft,
                                                transform: 'translateX(-50%)',
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Action Buttons */}
                    {!isClosed && (
                        <div className="mt-4 bg-muted/50 rounded-lg p-3 flex gap-2">
                            <Button
                                className="flex-1"
                                onClick={() => {
                                    onClose()
                                    onIncreaseLiquidity(selectedPosition)
                                }}
                            >
                                Add Liquidity
                            </Button>
                            <Button
                                className="flex-1"
                                variant="outline"
                                onClick={() => {
                                    onClose()
                                    onRemoveLiquidity(selectedPosition)
                                }}
                            >
                                Remove Liquidity
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
