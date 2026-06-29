'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'

// Re-encode a UTC unix time so lightweight-charts (which always formats as UTC)
// renders the user's local wall-clock time on the axis and crosshair.
export function toLocalChartTime(time: number): number {
    const d = new Date(time * 1000)
    return (
        Date.UTC(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            d.getHours(),
            d.getMinutes(),
            d.getSeconds()
        ) / 1000
    )
}

export function useChartColors() {
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'

    return useMemo(
        () => ({
            background: isDark ? 'hsl(232, 14%, 4%)' : 'hsl(0, 0%, 100%)',
            textColor: isDark ? 'hsl(220, 8%, 40%)' : 'hsl(220, 8%, 46%)',
            gridColor: isDark ? 'hsl(228, 12%, 15%)' : 'hsl(220, 12%, 90%)',
            crosshairColor: isDark ? 'hsl(228, 12%, 25%)' : 'hsl(220, 12%, 70%)',
            crosshairLabelBg: isDark ? 'hsl(232, 14%, 14%)' : 'hsl(220, 12%, 92%)',
            borderColor: isDark ? 'hsl(228, 12%, 10%)' : 'hsl(220, 12%, 88%)',
            volumeUp: isDark ? 'rgba(30, 215, 96, 0.25)' : 'rgba(30, 215, 96, 0.3)',
            volumeDown: isDark ? 'rgba(233, 20, 41, 0.25)' : 'rgba(233, 20, 41, 0.3)',
            ohlcvUp: 'text-positive',
            ohlcvDown: 'text-negative',
        }),
        [isDark]
    )
}
