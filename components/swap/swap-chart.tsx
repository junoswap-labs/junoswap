'use client'

import { useRef, useEffect, useMemo } from 'react'
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
import { Loader2 } from 'lucide-react'
import type { Token } from '@/types/tokens'
import { TIMEFRAMES } from '@/hooks/useTokenPriceHistory'
import { useSwapPairChart } from '@/hooks/useSwapPairChart'
import { useChartColors, toLocalChartTime } from '@/lib/lightweight-chart-theme'
import { formatChartPrice } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

interface SwapChartProps {
    tokenIn?: Token | null
    tokenOut?: Token | null
    className?: string
}

export function SwapChart({ tokenIn, tokenOut, className }: SwapChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
    const chartColors = useChartColors()

    const {
        candles,
        isLoading,
        isUnsupported,
        timeframe,
        setTimeframe,
        baseSymbol,
        quoteSymbol,
        denom,
    } = useSwapPairChart(tokenIn, tokenOut)

    const prefix = denom === 'usd' ? '$' : ''
    const hasVolume = useMemo(() => candles.some((c) => c.volume > 0), [candles])

    // candles from the hook are already continuous, windowed, and extended to now.
    const lastPrice = candles.length > 0 ? candles[candles.length - 1]!.close : null
    const changePct = useMemo(() => {
        if (candles.length === 0) return null
        const first = candles[0]!.open
        const last = candles[candles.length - 1]!.close
        if (first <= 0) return null
        return ((last - first) / first) * 100
    }, [candles])

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
                vertLines: { color: chartColors.gridColor, style: LineStyle.Dotted },
                horzLines: { color: chartColors.gridColor, style: LineStyle.Dotted },
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
                scaleMargins: { top: 0.1, bottom: 0.1 },
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
            upColor: 'rgb(30, 215, 96)',
            downColor: 'rgb(233, 20, 41)',
            borderUpColor: 'rgb(30, 215, 96)',
            borderDownColor: 'rgb(233, 20, 41)',
            wickUpColor: 'rgb(30, 215, 96)',
            wickDownColor: 'rgb(233, 20, 41)',
            lastValueVisible: true,
            priceLineVisible: true,
        })

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            lastValueVisible: false,
            priceLineVisible: false,
        })

        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        })

        chartRef.current = chart
        candleSeriesRef.current = candleSeries
        volumeSeriesRef.current = volumeSeries

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect
                chart.applyOptions({ width, height })
            }
        })
        resizeObserver.observe(chartContainerRef.current)

        return () => {
            resizeObserver.disconnect()
            chart.remove()
            chartRef.current = null
            candleSeriesRef.current = null
            volumeSeriesRef.current = null
        }
    }, [chartColors])

    useEffect(() => {
        if (!candleSeriesRef.current || !volumeSeriesRef.current) return

        candleSeriesRef.current.applyOptions({
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => `${prefix}${formatChartPrice(price)}`,
            },
        })

        if (candles.length === 0) {
            candleSeriesRef.current.setData([])
            volumeSeriesRef.current.setData([])
            return
        }

        // Shift to local wall-clock time, kept strictly ascending so the DST
        // "fall back" hour can't produce duplicate times and trip lightweight-charts.
        let lastT = -Infinity
        const localTimes = candles.map((d) => {
            let t = toLocalChartTime(d.time)
            if (t <= lastT) t = lastT + 1
            lastT = t
            return t
        })

        candleSeriesRef.current.setData(
            candles.map((d, i) => ({
                time: localTimes[i] as LWTime,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
            })) as LWCandlestickData<LWTime>[]
        )

        volumeSeriesRef.current.setData(
            hasVolume
                ? (candles.map((d, i) => ({
                      time: localTimes[i] as LWTime,
                      value: d.volume,
                      color: d.close >= d.open ? chartColors.volumeUp : chartColors.volumeDown,
                  })) as LWHistogramData<LWTime>[])
                : []
        )

        chartRef.current?.timeScale().fitContent()
    }, [candles, prefix, hasVolume, chartColors])

    return (
        <div className={cn('relative flex flex-col rounded-xl border bg-card', className)}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 px-3 py-2">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">
                        {baseSymbol && quoteSymbol
                            ? `${baseSymbol} / ${quoteSymbol}`
                            : 'Price chart'}
                    </span>
                    {lastPrice !== null && (
                        <span className="text-sm font-medium tabular-nums">
                            {prefix}
                            {formatChartPrice(lastPrice)}
                        </span>
                    )}
                    {changePct !== null && (
                        <span
                            className={cn(
                                'text-xs font-semibold tabular-nums',
                                changePct >= 0 ? 'text-positive' : 'text-negative'
                            )}
                        >
                            {changePct >= 0 ? '+' : ''}
                            {changePct.toFixed(2)}%
                        </span>
                    )}
                </div>
                <div className="ml-auto flex items-center gap-0.5">
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
            </div>

            <div className="relative flex-1">
                <div ref={chartContainerRef} className="h-[420px] w-full lg:h-[520px]" />

                {isUnsupported && (
                    <div className="absolute inset-0 flex items-center justify-center bg-card">
                        <EmptyState
                            title="Chart unavailable for this pair"
                            description="Price history isn't indexed for this token pair yet."
                        />
                    </div>
                )}

                {!isUnsupported && !isLoading && candles.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-card">
                        <EmptyState title="No trading data yet" />
                    </div>
                )}

                {!isUnsupported && isLoading && candles.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-card text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin text-primary/60" />
                        <span className="text-xs">Loading chart...</span>
                    </div>
                )}
            </div>
        </div>
    )
}
