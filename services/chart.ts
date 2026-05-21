import { formatEther } from 'viem'
import type { Timeframe, ChartMode, CandlestickData } from '@/types/chart'
import { TIMEFRAME_DURATIONS } from '@/types/chart'

const TOTAL_SUPPLY = 1_000_000_000 // 1 billion tokens

interface SwapEvent {
    timestamp: number
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
}

export function calculateMarketCapValue(event: SwapEvent): number {
    return calculatePrice(event) * TOTAL_SUPPLY
}

export function calculatePrice(event: SwapEvent): number {
    if (event.amountIn === 0n || event.amountOut === 0n) return 0
    const inNum = parseFloat(formatEther(event.amountIn))
    const outNum = parseFloat(formatEther(event.amountOut))
    if (outNum === 0 || inNum === 0) return 0
    // Price in KUB per token
    return event.isBuy ? inNum / outNum : outNum / inNum
}

function calculateVolume(event: SwapEvent): number {
    // Volume in KUB
    return event.isBuy
        ? parseFloat(formatEther(event.amountIn))
        : parseFloat(formatEther(event.amountOut))
}

export function aggregateCandlesticks(
    events: SwapEvent[],
    timeframe: Timeframe,
    mode: ChartMode = 'mcap'
): CandlestickData[] {
    if (events.length === 0) return []

    const duration = TIMEFRAME_DURATIONS[timeframe]
    const candles = new Map<number, CandlestickData>()

    for (const event of events) {
        const value = mode === 'mcap' ? calculateMarketCapValue(event) : calculatePrice(event)
        const volume = calculateVolume(event)
        if (value <= 0) continue

        const candleTime = Math.floor(event.timestamp / duration) * duration

        const existing = candles.get(candleTime)
        if (!existing) {
            candles.set(candleTime, {
                time: candleTime,
                open: value,
                high: value,
                low: value,
                close: value,
                volume,
            })
        } else {
            existing.high = Math.max(existing.high, value)
            existing.low = Math.min(existing.low, value)
            existing.close = value
            existing.volume += volume
        }
    }

    // Forward-fill missing time buckets for continuous candles
    const times = Array.from(candles.keys()).sort((a, b) => a - b)
    if (times.length === 0) return Array.from(candles.values())
    const firstTime = times[0]!
    const lastTime = times[times.length - 1]!
    let prevClose = candles.get(firstTime)!.close
    for (let t = firstTime + duration; t <= lastTime; t += duration) {
        if (!candles.has(t)) {
            candles.set(t, {
                time: t,
                open: prevClose,
                high: prevClose,
                low: prevClose,
                close: prevClose,
                volume: 0,
            })
        } else {
            prevClose = candles.get(t)!.close // known to exist
        }
    }

    return Array.from(candles.values()).sort((a, b) => a.time - b.time)
}
