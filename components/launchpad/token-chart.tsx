'use client'

import { useRef, useEffect, useMemo, useState } from 'react'
import { useGraduatedPoolPrice } from '@/hooks/useGraduatedPoolPrice'
import {
    createChart,
    CandlestickSeries,
    HistogramSeries,
    ColorType,
    CrosshairMode,
    LineStyle,
} from 'lightweight-charts'
import type {
    IChartApi,
    ISeriesApi,
    CandlestickData as LWCandlestickData,
    HistogramData as LWHistogramData,
    Time as LWTime,
} from 'lightweight-charts'
import {
    CreatorMarkerPrimitive,
    createJazziconAvatar,
    type CreatorMarker,
} from '@/lib/creator-marker-primitive'
import type { Address } from 'viem'
import { formatEther } from 'viem'
import { useChartColors, toLocalChartTime } from '@/lib/lightweight-chart-theme'
import { useTokenPriceHistory, TIMEFRAMES } from '@/hooks/useTokenPriceHistory'
import type { ChartMode } from '@/types/chart'
import { TIMEFRAME_DURATIONS } from '@/types/chart'
import { cn, formatAddress } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { buildCreatorMarkers, computeDailyMetrics } from '@/services/launchpad/chart'
import { TOTAL_SUPPLY } from '@/lib/launchpad-curve'
import type { DailyMetrics } from '@/services/launchpad/chart'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { useNativeUsdPriceContext } from './native-usd-price-provider'
import { formatCompact } from '@/services/launchpad/launchpad'
import { formatChartPrice } from '@/lib/format'

interface TokenChartProps {
    tokenAddr: Address
    nativeReserve?: bigint
    tokenReserve?: bigint
    virtualAmount?: bigint
    isGraduated?: boolean
    poolAddress?: Address
    graduatedAt?: number | null
    creatorAddress?: Address
    onDailyMetricsChange?: (metrics: DailyMetrics | null) => void
    className?: string
}

function formatMcap(value: number): string {
    if (value < 0.01) return '<0.01'
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}

// lightweight-charts uses this to quantize axis ticks/autoscale, independent of display
// formatting — mcap trades in whole cents, price mode routinely deals in sub-1e-6 tokens, so
// leaving it at the library's 0.01 default flattens every price-mode candle onto one tick.
function chartMinMove(mode: ChartMode): number {
    return mode === 'mcap' ? 0.01 : 1e-9
}

function formatChartValue(value: number, mode: ChartMode): string {
    return mode === 'mcap' ? formatMcap(value) : formatChartPrice(value)
}

export function TokenChart({
    tokenAddr,
    nativeReserve,
    tokenReserve,
    virtualAmount,
    isGraduated,
    poolAddress,
    graduatedAt,
    creatorAddress,
    onDailyMetricsChange,
    className,
}: TokenChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
    const chainId = useLaunchpadChainId()
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    const priceLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(
        null
    )
    const markersRef = useRef<CreatorMarkerPrimitive | null>(null)
    const avatarRef = useRef<HTMLCanvasElement | null>(null)

    const {
        data,
        feeBreakdown,
        creatorTrades,
        isLoading,
        timeframe,
        setTimeframe,
        chartMode,
        setChartMode,
    } = useTokenPriceHistory(tokenAddr, isGraduated, graduatedAt, creatorAddress)

    const { price: livePoolPrice } = useGraduatedPoolPrice({
        poolAddress,
        tokenAddr,
        wrappedNative: wrappedNative as Address | undefined,
        chainId,
        isGraduated,
    })

    const chartColors = useChartColors()
    const { nativeUsdPrice } = useNativeUsdPriceContext()
    const [vol1d, setVol1d] = useState<number | null>(null)

    const displayData = useMemo(() => {
        let result = data

        if (nativeUsdPrice !== null) {
            result = result.map((d) => ({
                ...d,
                open: d.open * nativeUsdPrice,
                high: d.high * nativeUsdPrice,
                low: d.low * nativeUsdPrice,
                close: d.close * nativeUsdPrice,
            }))
        }

        if (result.length === 0) return result

        if (isGraduated && poolAddress && livePoolPrice !== null) {
            const value = chartMode === 'mcap' ? livePoolPrice * TOTAL_SUPPLY : livePoolPrice
            const displayValue = nativeUsdPrice !== null ? value * nativeUsdPrice : value
            const lastIdx = result.length - 1

            result = result.map((d, i) =>
                i === lastIdx
                    ? {
                          ...d,
                          close: displayValue,
                          high: Math.max(d.high, displayValue),
                          low: Math.min(d.low, displayValue),
                      }
                    : d
            )
        } else if (
            virtualAmount !== undefined &&
            nativeReserve !== undefined &&
            nativeReserve > 0n &&
            tokenReserve !== undefined &&
            tokenReserve > 0n
        ) {
            const price =
                parseFloat(formatEther(virtualAmount + nativeReserve)) /
                parseFloat(formatEther(tokenReserve))
            const value = chartMode === 'mcap' ? price * TOTAL_SUPPLY : price
            const displayValue = nativeUsdPrice !== null ? value * nativeUsdPrice : value
            const lastIdx = result.length - 1

            result = result.map((d, i) =>
                i === lastIdx
                    ? {
                          ...d,
                          close: displayValue,
                          high: Math.max(d.high, displayValue),
                          low: Math.min(d.low, displayValue),
                      }
                    : d
            )
        }

        const duration = TIMEFRAME_DURATIONS[timeframe]
        const nowBucket = Math.floor(Math.floor(Date.now() / 1000) / duration) * duration
        const lastCandle = result[result.length - 1]!
        if (lastCandle.time < nowBucket) {
            const flatPrice = lastCandle.close
            const fill: typeof result = []
            for (let t = lastCandle.time + duration; t <= nowBucket; t += duration) {
                fill.push({
                    time: t,
                    open: flatPrice,
                    high: flatPrice,
                    low: flatPrice,
                    close: flatPrice,
                    volume: 0,
                })
            }
            result = [...result, ...fill]
        }

        return result
    }, [
        data,
        nativeUsdPrice,
        virtualAmount,
        nativeReserve,
        tokenReserve,
        chartMode,
        timeframe,
        isGraduated,
        poolAddress,
        livePoolPrice,
    ])

    const visibleData = useMemo(() => displayData.filter((d) => d.volume > 0), [displayData])

    const ohlcvRef = useRef<HTMLDivElement>(null)
    const currentOhlcv = useRef<{
        open: number
        high: number
        low: number
        close: number
        volume: number
        change: number
    } | null>(null)
    const lastCandleRef = useRef(currentOhlcv.current)
    const updateOhlcvDom = useRef<
        (
            d: {
                open: number
                high: number
                low: number
                close: number
                volume: number
                change: number
            } | null
        ) => void
    >(() => {})

    const tooltipRef = useRef<HTMLDivElement>(null)
    const updateTooltipDom = useRef<(marker: CreatorMarker | null, x: number, y: number) => void>(
        () => {}
    )

    updateTooltipDom.current = (marker, x, y) => {
        const el = tooltipRef.current
        const container = chartContainerRef.current
        if (!el || !container || !marker) {
            if (el) el.style.display = 'none'
            return
        }
        const isUsd = nativeUsdPrice !== null
        const nativeDisplay = isUsd
            ? `$${formatCompact(marker.nativeAmount * nativeUsdPrice!)}`
            : `${formatCompact(marker.nativeAmount)} KUB`
        const action = marker.isBuy ? 'bought' : 'sold'
        const actionColor = marker.isBuy ? chartColors.ohlcvUp : chartColors.ohlcvDown
        const when = new Date(marker.timestamp * 1000).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

        el.innerHTML =
            `<div class="font-semibold ${actionColor}">Creator ${action}</div>` +
            (creatorAddress
                ? `<div class="text-muted-foreground">${formatAddress(creatorAddress)}</div>`
                : '') +
            `<div class="mt-0.5 text-foreground">${nativeDisplay} · ${formatCompact(marker.tokenAmount)} tokens</div>` +
            `<div class="text-muted-foreground">${when}</div>`

        el.style.display = ''
        const { width: cw, height: ch } = container.getBoundingClientRect()
        const tw = el.offsetWidth
        const th = el.offsetHeight
        let left = x + 12
        if (left + tw > cw) left = x - tw - 12
        if (left < 0) left = 0
        let top = y - th - 8
        if (top < 0) top = y + 12
        if (top + th > ch) top = ch - th
        el.style.left = `${left}px`
        el.style.top = `${top}px`
    }

    updateOhlcvDom.current = (d) => {
        currentOhlcv.current = d
        const el = ohlcvRef.current
        if (!el || !d) {
            if (el) el.style.display = 'none'
            return
        }
        el.style.display = ''
        const isUsd = nativeUsdPrice !== null
        const prefix = isUsd ? '$' : ''
        const fmt = (v: number) => `${prefix}${formatChartValue(v, chartMode)}`
        const up = chartColors.ohlcvUp
        const down = chartColors.ohlcvDown
        const cls = (cond: boolean) => (cond ? up : down)
        el.innerHTML =
            `<span class="text-muted-foreground">O <span class="${cls(d.open <= d.close)}">${fmt(d.open)}</span></span>` +
            `<span class="text-muted-foreground">H <span class="${cls(d.high >= d.close)}">${fmt(d.high)}</span></span>` +
            `<span class="text-muted-foreground">L <span class="${cls(d.low <= d.close)}">${fmt(d.low)}</span></span>` +
            `<span class="text-muted-foreground">C <span class="${cls(d.change >= 0)}">${fmt(d.close)}</span></span>` +
            `<span class="font-semibold ${cls(d.change >= 0)}">${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}%</span>`
    }

    useEffect(() => {
        if (!chartContainerRef.current) return

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: chartColors.background },
                textColor: chartColors.textColor,
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 11,
            },
            grid: {
                vertLines: {
                    color: chartColors.gridColor,
                    style: LineStyle.Dotted,
                },
                horzLines: {
                    color: chartColors.gridColor,
                    style: LineStyle.Dotted,
                },
            },
            crosshair: {
                mode: CrosshairMode.Magnet,
                vertLine: {
                    color: chartColors.crosshairColor,
                    width: 1,
                    style: LineStyle.Dashed,
                    labelVisible: true,
                    labelBackgroundColor: chartColors.crosshairLabelBg,
                },
                horzLine: {
                    color: chartColors.crosshairColor,
                    width: 1,
                    style: LineStyle.Dashed,
                    labelVisible: true,
                    labelBackgroundColor: chartColors.crosshairLabelBg,
                },
            },
            rightPriceScale: {
                borderColor: chartColors.borderColor,
                scaleMargins: { top: 0.05, bottom: 0.25 },
            },
            timeScale: {
                borderColor: chartColors.borderColor,
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 5,
                barSpacing: 8,
                minBarSpacing: 2,
            },
        })

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: chartColors.candleUp,
            downColor: chartColors.candleDown,
            borderUpColor: chartColors.candleUp,
            borderDownColor: chartColors.candleDown,
            wickUpColor: chartColors.candleUp,
            wickDownColor: chartColors.candleDown,
            lastValueVisible: false,
            priceLineVisible: false,
        })

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            lastValueVisible: false,
            priceLineVisible: false,
        })

        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.75, bottom: 0 },
        })

        const crosshairHandler = (
            param: Parameters<Parameters<typeof chart.subscribeCrosshairMove>[0]>[0]
        ) => {
            if (param.point) {
                const marker = markersRef.current?.markerAt(param.point.x, param.point.y) ?? null
                updateTooltipDom.current(marker, param.point.x, param.point.y)
            } else {
                updateTooltipDom.current(null, 0, 0)
            }

            if (!param.time || !param.point) {
                updateOhlcvDom.current(lastCandleRef.current)
                return
            }

            const candleData = param.seriesData.get(candleSeries)
            if (candleData && 'open' in candleData) {
                const ohlcv = candleData as {
                    open: number
                    high: number
                    low: number
                    close: number
                }
                const volData = param.seriesData.get(volumeSeries)
                const volume =
                    volData && 'value' in volData ? (volData as { value: number }).value : 0
                const change =
                    ohlcv.open !== 0 ? ((ohlcv.close - ohlcv.open) / ohlcv.open) * 100 : 0

                updateOhlcvDom.current({ ...ohlcv, volume, change })
            }
        }
        chart.subscribeCrosshairMove(crosshairHandler)

        chartRef.current = chart
        candleSeriesRef.current = candleSeries
        volumeSeriesRef.current = volumeSeries

        const markerPrimitive = new CreatorMarkerPrimitive()
        candleSeries.attachPrimitive(markerPrimitive)
        markerPrimitive.setAvatar(avatarRef.current)
        markersRef.current = markerPrimitive

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect
                chart.applyOptions({ width, height })
            }
        })
        resizeObserver.observe(chartContainerRef.current)

        return () => {
            chart.unsubscribeCrosshairMove(crosshairHandler)
            resizeObserver.disconnect()
            chart.remove()
            chartRef.current = null
            candleSeriesRef.current = null
            volumeSeriesRef.current = null
            priceLineRef.current = null
            markersRef.current = null
        }
    }, [chartColors])

    useEffect(() => {
        if (!creatorAddress) {
            avatarRef.current = null
            markersRef.current?.setAvatar(null)
            return
        }
        let cancelled = false
        createJazziconAvatar(creatorAddress, 72).then((canvas) => {
            if (cancelled) return
            avatarRef.current = canvas
            markersRef.current?.setAvatar(canvas)
        })
        return () => {
            cancelled = true
        }
    }, [creatorAddress])

    useEffect(() => {
        if (!candleSeriesRef.current || !volumeSeriesRef.current || visibleData.length === 0) return

        const isUsd = nativeUsdPrice !== null
        const prefix = isUsd ? '$' : ''

        candleSeriesRef.current.applyOptions({
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => `${prefix}${formatChartValue(price, chartMode)}`,
                minMove: chartMinMove(chartMode),
            },
        })

        let lastT = -Infinity
        const localTimes = visibleData.map((d) => {
            let t = toLocalChartTime(d.time)
            if (t <= lastT) t = lastT + 1
            lastT = t
            return t
        })

        candleSeriesRef.current.setData(
            visibleData.map((d, i) => ({
                time: localTimes[i] as LWTime,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
            })) as LWCandlestickData<LWTime>[]
        )

        volumeSeriesRef.current.setData(
            visibleData.map((d, i) => ({
                time: localTimes[i] as LWTime,
                value: d.volume,
                color: d.close >= d.open ? chartColors.volumeUp : chartColors.volumeDown,
            })) as LWHistogramData<LWTime>[]
        )

        const bucketToCandle = new Map<number, { chartTime: LWTime; high: number }>()
        visibleData.forEach((d, i) =>
            bucketToCandle.set(d.time, { chartTime: localTimes[i] as LWTime, high: d.high })
        )
        const markerPoints = buildCreatorMarkers(
            creatorTrades,
            timeframe,
            visibleData.map((d) => d.time)
        )
        markersRef.current?.setMarkers(
            markerPoints.map((p) => {
                const candle = bucketToCandle.get(p.time)!
                return {
                    time: candle.chartTime,
                    high: candle.high,
                    isBuy: p.isBuy,
                    nativeAmount: p.nativeAmount,
                    tokenAmount: p.tokenAmount,
                    timestamp: p.timestamp,
                }
            })
        )

        if (priceLineRef.current) {
            candleSeriesRef.current.removePriceLine(priceLineRef.current)
            priceLineRef.current = null
        }

        const lastCandle = visibleData[visibleData.length - 1]
        if (lastCandle) {
            const isUp = lastCandle.close >= lastCandle.open
            priceLineRef.current = candleSeriesRef.current.createPriceLine({
                price: lastCandle.close,
                color: isUp ? chartColors.candleUp : chartColors.candleDown,
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: '',
            })

            const ohlcv = {
                open: lastCandle.open,
                high: lastCandle.high,
                low: lastCandle.low,
                close: lastCandle.close,
                volume: lastCandle.volume,
                change:
                    lastCandle.open !== 0
                        ? ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100
                        : 0,
            }
            lastCandleRef.current = ohlcv
            updateOhlcvDom.current(ohlcv)
        }

        const metrics = computeDailyMetrics(displayData, nativeUsdPrice)
        setVol1d(metrics?.volume1d ?? null)
        onDailyMetricsChange?.(metrics ? { ...metrics, feeBreakdown } : null)

        const VISIBLE_CANDLES = 60
        const len = visibleData.length
        if (len > VISIBLE_CANDLES) {
            chartRef.current?.timeScale().setVisibleLogicalRange({
                from: len - VISIBLE_CANDLES,
                to: len + 2, // small right gap, matches the timeScale rightOffset: 5
            })
        } else {
            chartRef.current?.timeScale().fitContent() // few candles → just fit them all
        }
    }, [
        displayData,
        visibleData,
        chartMode,
        nativeUsdPrice,
        chartColors,
        onDailyMetricsChange,
        feeBreakdown,
        creatorTrades,
        timeframe,
    ])

    return (
        <div className={cn('relative rounded-lg border border-border/60 bg-card', className)}>
            <div className="flex min-h-11 flex-wrap items-center gap-1.5 border-b border-border/50 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-0">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setChartMode('mcap')}
                        className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                            chartMode === 'mcap'
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground/40 hover:text-muted-foreground'
                        )}
                    >
                        Mcap
                    </button>
                    <button
                        onClick={() => setChartMode('price')}
                        className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                            chartMode === 'price'
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground/40 hover:text-muted-foreground'
                        )}
                    >
                        Price
                    </button>
                </div>

                <div className="mx-0.5 h-5 w-px bg-border/50" />

                <div className="flex items-center gap-0.5">
                    {TIMEFRAMES.map((tf) => (
                        <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={cn(
                                'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                                timeframe === tf
                                    ? 'bg-accent font-semibold text-foreground'
                                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                            )}
                        >
                            {tf}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {vol1d !== null && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                            Vol 1D{' '}
                            <span className="text-foreground font-medium">
                                {nativeUsdPrice !== null ? '$' : ''}
                                {formatCompact(vol1d)}
                            </span>
                        </span>
                    )}
                    {isLoading && (
                        <span className="animate-pulse text-[11px] text-muted-foreground">
                            Loading...
                        </span>
                    )}
                </div>
            </div>

            <div className="relative">
                <div
                    ref={ohlcvRef}
                    style={{ display: 'none' }}
                    className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap items-center gap-2 font-mono text-[10px] sm:left-3 sm:gap-3 sm:text-[11px]"
                />

                <div
                    ref={tooltipRef}
                    style={{ display: 'none' }}
                    className="pointer-events-none absolute z-20 rounded-md border border-border/60 bg-popover/95 px-2.5 py-1.5 text-[11px] leading-tight shadow-lg backdrop-blur-sm"
                />

                <div
                    ref={chartContainerRef}
                    className="h-[320px] w-full md:h-[420px] lg:h-[500px]"
                />
            </div>

            {!isLoading && displayData.length === 0 && (
                <EmptyState
                    title="No trading data yet"
                    className="pointer-events-none absolute inset-x-0 bottom-0 top-11"
                />
            )}
        </div>
    )
}
