'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
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
import type { Address } from 'viem'
import { useTheme } from 'next-themes'
import { useTokenPriceHistory, TIMEFRAMES } from '@/hooks/useTokenPriceHistory'
import type { ChartMode } from '@/types/chart'
import { cn } from '@/lib/utils'
import { BarChart3 } from 'lucide-react'

interface TokenChartProps {
    tokenAddr: Address
    className?: string
}

function formatPrice(value: number): string {
    if (value < 0.0001) return '<0.0001'
    if (value < 1) return value.toFixed(6)
    if (value < 100) return value.toFixed(4)
    return value.toFixed(2)
}

function formatMcap(value: number): string {
    if (value < 0.01) return '<0.01'
    if (value < 1) return value.toFixed(2)
    if (value < 1000) return value.toFixed(2)
    if (value < 1_000_000) return `${(value / 1_000).toFixed(2)}K`
    if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    return `${(value / 1_000_000_000).toFixed(2)}B`
}

function formatChartValue(value: number, mode: ChartMode): string {
    return mode === 'mcap' ? formatMcap(value) : formatPrice(value)
}

function useChartColors() {
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
            volumeUp: isDark ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.3)',
            volumeDown: isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.3)',
            ohlcvUp: isDark ? 'text-emerald-400' : 'text-emerald-600',
            ohlcvDown: isDark ? 'text-red-400' : 'text-red-600',
        }),
        [isDark]
    )
}

export function TokenChart({ tokenAddr, className }: TokenChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
    const priceLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(
        null
    )

    const { data, isLoading, timeframe, setTimeframe, chartMode, setChartMode } =
        useTokenPriceHistory(tokenAddr)
    const chartColors = useChartColors()

    // OHLCV overlay state
    const [ohlcvData, setOhlcvData] = useState<{
        open: number
        high: number
        low: number
        close: number
        volume: number
        change: number
    } | null>(null)
    const lastCandleRef = useRef<typeof ohlcvData>(null)

    // Initialize chart
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
            upColor: 'hsl(153, 80%, 45%)',
            downColor: 'hsl(0, 72%, 42%)',
            borderUpColor: 'hsl(153, 80%, 55%)',
            borderDownColor: 'hsl(0, 72%, 50%)',
            wickUpColor: 'hsl(153, 60%, 40%)',
            wickDownColor: 'hsl(0, 60%, 38%)',
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

        // Subscribe to crosshair move for OHLCV overlay
        const crosshairHandler = (
            param: Parameters<Parameters<typeof chart.subscribeCrosshairMove>[0]>[0]
        ) => {
            if (!param.time || !param.point) {
                setOhlcvData(lastCandleRef.current)
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

                setOhlcvData({ ...ohlcv, volume, change })
            }
        }
        chart.subscribeCrosshairMove(crosshairHandler)

        chartRef.current = chart
        candleSeriesRef.current = candleSeries
        volumeSeriesRef.current = volumeSeries

        // Handle resize
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
        }
    }, [chartColors])

    // Update data
    useEffect(() => {
        if (!candleSeriesRef.current || !volumeSeriesRef.current || data.length === 0) return

        candleSeriesRef.current.setData(
            data.map((d) => ({
                time: d.time as LWTime,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
            })) as LWCandlestickData<LWTime>[]
        )

        volumeSeriesRef.current.setData(
            data.map((d) => ({
                time: d.time as LWTime,
                value: d.volume,
                color: d.close >= d.open ? chartColors.volumeUp : chartColors.volumeDown,
            })) as LWHistogramData<LWTime>[]
        )

        // Update price line
        if (priceLineRef.current) {
            candleSeriesRef.current.removePriceLine(priceLineRef.current)
            priceLineRef.current = null
        }

        const lastCandle = data[data.length - 1]
        if (lastCandle) {
            const isUp = lastCandle.close >= lastCandle.open
            priceLineRef.current = candleSeriesRef.current.createPriceLine({
                price: lastCandle.close,
                color: isUp ? 'hsl(153, 80%, 45%)' : 'hsl(0, 72%, 42%)',
                lineWidth: 1,
                lineStyle: 2, // dashed
                axisLabelVisible: true,
                title: '',
            })

            // Update OHLCV overlay fallback
            lastCandleRef.current = {
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
            setOhlcvData(lastCandleRef.current)
        }

        chartRef.current?.timeScale().fitContent()
    }, [data])

    return (
        <div className={cn('relative rounded-lg border border-border/60 bg-card', className)}>
            {/* Enhanced toolbar */}
            <div className="flex min-h-11 flex-wrap items-center gap-1.5 border-b border-border/50 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-0">
                {/* Mcap / Price toggle */}
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

                {/* Timeframe buttons */}
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

                {/* Right side */}
                <div className="ml-auto flex items-center gap-2">
                    {isLoading && (
                        <span className="animate-pulse text-[11px] text-muted-foreground">
                            Loading...
                        </span>
                    )}
                </div>
            </div>

            {/* Chart area with OHLCV overlay */}
            <div className="relative">
                {/* OHLCV overlay */}
                {ohlcvData && (
                    <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap items-center gap-2 font-mono text-[10px] sm:left-3 sm:gap-3 sm:text-[11px]">
                        <span className="text-muted-foreground">
                            O{' '}
                            <span
                                className={
                                    ohlcvData.open <= ohlcvData.close
                                        ? chartColors.ohlcvUp
                                        : chartColors.ohlcvDown
                                }
                            >
                                {formatChartValue(ohlcvData.open, chartMode)}
                            </span>
                        </span>
                        <span className="text-muted-foreground">
                            H{' '}
                            <span
                                className={
                                    ohlcvData.high >= ohlcvData.close
                                        ? chartColors.ohlcvUp
                                        : chartColors.ohlcvDown
                                }
                            >
                                {formatChartValue(ohlcvData.high, chartMode)}
                            </span>
                        </span>
                        <span className="text-muted-foreground">
                            L{' '}
                            <span
                                className={
                                    ohlcvData.low <= ohlcvData.close
                                        ? chartColors.ohlcvUp
                                        : chartColors.ohlcvDown
                                }
                            >
                                {formatChartValue(ohlcvData.low, chartMode)}
                            </span>
                        </span>
                        <span className="text-muted-foreground">
                            C{' '}
                            <span
                                className={
                                    ohlcvData.change >= 0
                                        ? chartColors.ohlcvUp
                                        : chartColors.ohlcvDown
                                }
                            >
                                {formatChartValue(ohlcvData.close, chartMode)}
                            </span>
                        </span>
                        <span
                            className={cn(
                                'font-semibold',
                                ohlcvData.change >= 0 ? chartColors.ohlcvUp : chartColors.ohlcvDown
                            )}
                        >
                            {ohlcvData.change >= 0 ? '+' : ''}
                            {ohlcvData.change.toFixed(2)}%
                        </span>
                    </div>
                )}

                <div
                    ref={chartContainerRef}
                    className="h-[320px] w-full md:h-[420px] lg:h-[500px]"
                />
            </div>

            {/* Empty state overlay */}
            {!isLoading && data.length === 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 top-11 flex flex-col items-center justify-center gap-3">
                    <div className="relative flex h-16 w-16 items-center justify-center">
                        <div className="absolute inset-0 rounded-full bg-muted/40" />
                        <BarChart3 className="relative h-8 w-8 text-muted-foreground/50" />
                    </div>
                    <span className="text-sm text-muted-foreground/70">No trading data yet</span>
                </div>
            )}
        </div>
    )
}
