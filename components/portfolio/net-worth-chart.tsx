'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { NetWorthPoint } from '@/services/portfolio/net-worth'

const useMeasureEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface NetWorthChartProps {
    data: NetWorthPoint[]
    className?: string
}

const HEIGHT = 120
const PAD_Y = 10
const PAD_RIGHT = 8

function formatValue(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatTime(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
}

export function NetWorthChart({ data, className }: NetWorthChartProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(0)
    const [hoverIndex, setHoverIndex] = useState<number | null>(null)
    const gradientId = useId()

    useMeasureEffect(() => {
        const el = containerRef.current
        if (!el) return
        setWidth(el.getBoundingClientRect().width)
        const observer = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width
            if (w) setWidth(w)
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    const geometry = useMemo(() => {
        if (data.length < 2 || width === 0) return null

        const t0 = data[0]!.timestamp
        const t1 = data[data.length - 1]!.timestamp
        const tSpan = Math.max(t1 - t0, 1)

        let min = Infinity
        let max = -Infinity
        for (const p of data) {
            if (p.value < min) min = p.value
            if (p.value > max) max = p.value
        }
        const vSpan = max - min || Math.max(max, 1) * 0.02
        const vMid = (max + min) / 2
        const lo = vMid - vSpan / 2
        const plotW = width - PAD_RIGHT
        const plotH = HEIGHT - PAD_Y * 2

        const x = (t: number) => ((t - t0) / tSpan) * plotW
        const y = (v: number) => PAD_Y + plotH - ((v - lo) / vSpan) * plotH

        const points = data.map((p) => ({ x: x(p.timestamp), y: y(p.value) }))
        const line = points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
            .join('')
        const area = `${line}L${points[points.length - 1]!.x.toFixed(2)},${HEIGHT}L${points[0]!.x.toFixed(2)},${HEIGHT}Z`

        return { points, line, area, openY: y(data[0]!.value) }
    }, [data, width])

    const isUp = data.length >= 2 && data[data.length - 1]!.value >= data[0]!.value
    const color = isUp ? 'hsl(var(--positive))' : 'hsl(var(--negative))'

    const findNearest = useCallback(
        (px: number) => {
            if (!geometry) return null
            let best = 0
            let bestDist = Infinity
            for (let i = 0; i < geometry.points.length; i++) {
                const d = Math.abs(geometry.points[i]!.x - px)
                if (d < bestDist) {
                    bestDist = d
                    best = i
                }
            }
            return best
        },
        [geometry]
    )

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            const rect = e.currentTarget.getBoundingClientRect()
            setHoverIndex(findNearest(e.clientX - rect.left))
        },
        [findNearest]
    )

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<SVGSVGElement>) => {
            if (e.key === 'Escape') {
                setHoverIndex(null)
                return
            }
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            e.preventDefault()
            const step = e.key === 'ArrowLeft' ? -1 : 1
            setHoverIndex((prev) => {
                const next = (prev ?? data.length - 1) + step
                return Math.min(Math.max(next, 0), data.length - 1)
            })
        },
        [data.length]
    )

    if (data.length < 2) return null

    const hover = hoverIndex !== null && geometry ? geometry.points[hoverIndex] : null
    const hoverPoint = hoverIndex !== null ? data[hoverIndex] : null
    const last = geometry?.points[geometry.points.length - 1]
    const current = data[data.length - 1]!

    return (
        <div
            ref={containerRef}
            className={cn('relative w-full select-none', className)}
            style={{ height: HEIGHT }}
        >
            <svg
                width={width}
                height={HEIGHT}
                className="block cursor-crosshair overflow-visible outline-none"
                role="img"
                aria-label={`1-day net worth chart, currently ${formatValue(current.value)}`}
                tabIndex={0}
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoverIndex(null)}
                onBlur={() => setHoverIndex(null)}
                onKeyDown={handleKeyDown}
            >
                {geometry && (
                    <>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity="0.14" />
                                <stop offset="100%" stopColor={color} stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        <line
                            x1={0}
                            x2={width - PAD_RIGHT}
                            y1={geometry.openY}
                            y2={geometry.openY}
                            stroke="hsl(var(--border))"
                            strokeOpacity="0.5"
                            strokeWidth="1"
                        />

                        <path d={geometry.area} fill={`url(#${gradientId})`} />
                        <path
                            d={geometry.line}
                            fill="none"
                            stroke={color}
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />

                        {last && !hover && (
                            <circle
                                cx={last.x}
                                cy={last.y}
                                r="4"
                                fill={color}
                                stroke="hsl(var(--background))"
                                strokeWidth="2"
                            />
                        )}

                        {hover && (
                            <>
                                <line
                                    x1={hover.x}
                                    x2={hover.x}
                                    y1={0}
                                    y2={HEIGHT}
                                    stroke="hsl(var(--muted-foreground))"
                                    strokeOpacity="0.4"
                                    strokeWidth="1"
                                />
                                <circle
                                    cx={hover.x}
                                    cy={hover.y}
                                    r="4"
                                    fill={color}
                                    stroke="hsl(var(--background))"
                                    strokeWidth="2"
                                />
                            </>
                        )}
                    </>
                )}
            </svg>

            {hover && hoverPoint && (
                <div
                    className="pointer-events-none absolute z-10 rounded-md border border-border/50 bg-popover/95 px-2.5 py-1.5 shadow-md backdrop-blur-sm"
                    style={{
                        left: hover.x + 112 > width ? hover.x - 108 : hover.x + 12,
                        top: Math.min(Math.max(hover.y - 56, 0), HEIGHT - 52),
                    }}
                >
                    <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {formatValue(hoverPoint.value)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {formatTime(hoverPoint.timestamp)}
                    </div>
                </div>
            )}
        </div>
    )
}
