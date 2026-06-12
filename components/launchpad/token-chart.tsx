'use client'

import { useRef, useEffect, useMemo, useState } from 'react'
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
import { formatEther } from 'viem'
import { useTheme } from 'next-themes'
import { useReadContract } from 'wagmi'
import { useTokenPriceHistory, TIMEFRAMES } from '@/hooks/useTokenPriceHistory'
import type { ChartMode } from '@/types/chart'
import { TIMEFRAME_DURATIONS } from '@/types/chart'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { calculatePriceFromSqrtPrice, computeDailyMetrics } from '@/services/chart'
import type { DailyMetrics } from '@/services/chart'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { useNativeUsdPriceContext } from './native-usd-price-provider'
import { formatCompact } from '@/services/launchpad'

const WRAPPED_NATIVE = INTERMEDIARY_TOKENS[PUMP_CORE_NATIVE_CHAIN_ID]?.wrappedNative

interface TokenChartProps {
    tokenAddr: Address
    nativeReserve?: bigint
    tokenReserve?: bigint
    virtualAmount?: bigint
    isGraduated?: boolean
    poolAddress?: Address
    graduatedAt?: number | null
    onDailyMetricsChange?: (metrics: DailyMetrics | null) => void
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

export function TokenChart({
    tokenAddr,
    nativeReserve,
    tokenReserve,
    virtualAmount,
    isGraduated,
    poolAddress,
    graduatedAt,
    onDailyMetricsChange,
    className,
}: TokenChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
    const priceLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(
        null
    )

    const { data, isLoading, timeframe, setTimeframe, chartMode, setChartMode } =
        useTokenPriceHistory(tokenAddr, isGraduated, graduatedAt)

    // Read V3 pool slot0 for live price when graduated
    const { data: slot0 } = useReadContract({
        address: poolAddress,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'slot0' as const,
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        query: {
            enabled: !!isGraduated && !!poolAddress,
            refetchInterval: 15_000,
        },
    })

    const chartColors = useChartColors()
    const { nativeUsdPrice } = useNativeUsdPriceContext()
    const [vol1d, setVol1d] = useState<number | null>(null)

    const displayData = useMemo(() => {
        let result = data

        // Convert to USD
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

        // Step 1: Update last trade candle with live spot price
        if (isGraduated && poolAddress && slot0) {
            // V3 live price from slot0
            const sqrtPriceX96 = (
                slot0 as [bigint, number, number, number, number, number, boolean]
            )[0]
            if (sqrtPriceX96 && sqrtPriceX96 > 0n && WRAPPED_NATIVE) {
                const tokenIsToken0 = tokenAddr.toLowerCase() < WRAPPED_NATIVE.toLowerCase()
                const price = calculatePriceFromSqrtPrice(sqrtPriceX96, tokenIsToken0)
                const value = chartMode === 'mcap' ? price * 1e9 : price
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
        } else if (
            virtualAmount !== undefined &&
            nativeReserve !== undefined &&
            nativeReserve > 0n &&
            tokenReserve !== undefined &&
            tokenReserve > 0n
        ) {
            // Bonding curve live price from reserves
            const price =
                parseFloat(formatEther(virtualAmount + nativeReserve)) /
                parseFloat(formatEther(tokenReserve))
            const value = chartMode === 'mcap' ? price * 1e9 : price
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

        // Step 2: Forward-fill flat candles from last trade candle to current time
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
        slot0,
        tokenAddr,
    ])

    // OHLCV overlay - updated via DOM to avoid re-render loops
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
            upColor: 'rgb(34, 197, 94)',
            downColor: 'rgb(239, 68, 68)',
            borderUpColor: 'rgb(34, 197, 94)',
            borderDownColor: 'rgb(239, 68, 68)',
            wickUpColor: 'rgb(34, 197, 94)',
            wickDownColor: 'rgb(239, 68, 68)',
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
        if (!candleSeriesRef.current || !volumeSeriesRef.current || displayData.length === 0) return

        const isUsd = nativeUsdPrice !== null
        const prefix = isUsd ? '$' : ''

        candleSeriesRef.current.applyOptions({
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => `${prefix}${formatChartValue(price, chartMode)}`,
            },
        })

        candleSeriesRef.current.setData(
            displayData.map((d) => ({
                time: d.time as LWTime,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
            })) as LWCandlestickData<LWTime>[]
        )

        volumeSeriesRef.current.setData(
            displayData.map((d) => ({
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

        const lastCandle = displayData[displayData.length - 1]
        if (lastCandle) {
            const isUp = lastCandle.close >= lastCandle.open
            priceLineRef.current = candleSeriesRef.current.createPriceLine({
                price: lastCandle.close,
                color: isUp ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
                lineWidth: 1,
                lineStyle: 2, // dashed
                axisLabelVisible: true,
                title: '',
            })

            // Update OHLCV overlay fallback
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
        onDailyMetricsChange?.(metrics)

        chartRef.current?.timeScale().fitContent()
    }, [displayData, chartMode, nativeUsdPrice, chartColors, onDailyMetricsChange])

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

            {/* Chart area with OHLCV overlay */}
            <div className="relative">
                {/* OHLCV overlay - updated via DOM to avoid re-render loops */}
                <div
                    ref={ohlcvRef}
                    style={{ display: 'none' }}
                    className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap items-center gap-2 font-mono text-[10px] sm:left-3 sm:gap-3 sm:text-[11px]"
                />

                <div
                    ref={chartContainerRef}
                    className="h-[320px] w-full md:h-[420px] lg:h-[500px]"
                />
            </div>

            {/* Empty state overlay */}
            {!isLoading && displayData.length === 0 && (
                <EmptyState
                    title="No trading data yet"
                    className="pointer-events-none absolute inset-x-0 bottom-0 top-11"
                />
            )}
        </div>
    )
}
