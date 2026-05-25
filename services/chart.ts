import { formatEther } from 'viem'
import type { Timeframe, ChartMode, CandlestickData } from '@/types/chart'
import { TIMEFRAME_DURATIONS } from '@/types/chart'

const TOTAL_SUPPLY = 1_000_000_000 // 1 billion tokens
const VIRTUAL_AMOUNT = 3400n * 10n ** 18n

interface SwapEvent {
    timestamp: number
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
}

export function calculateMarketCapValue(event: SwapEvent): number {
    return calculatePrice(event) * TOTAL_SUPPLY
}

export function calculatePrice(event: SwapEvent): number {
    const nativeReserve = event.isBuy ? event.reserveIn : event.reserveOut
    const tokenReserve = event.isBuy ? event.reserveOut : event.reserveIn
    if (nativeReserve === 0n || tokenReserve === 0n) return 0
    const effectiveReserve = parseFloat(formatEther(nativeReserve + VIRTUAL_AMOUNT))
    const tokenRes = parseFloat(formatEther(tokenReserve))
    if (tokenRes === 0) return 0
    return effectiveReserve / tokenRes
}

function calculatePreSwapPrice(event: SwapEvent): number {
    let preNative: bigint, preToken: bigint
    if (event.isBuy) {
        preNative = event.reserveIn - event.amountIn
        preToken = event.reserveOut + event.amountOut
    } else {
        preNative = event.reserveOut + event.amountOut
        preToken = event.reserveIn - event.amountIn
    }
    if (preNative < 0n || preToken <= 0n) return 0
    const effectiveReserve = parseFloat(formatEther(preNative + VIRTUAL_AMOUNT))
    const tokenRes = parseFloat(formatEther(preToken))
    if (tokenRes === 0) return 0
    return effectiveReserve / tokenRes
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
            const openPrice = calculatePreSwapPrice(event)
            const openValue = mode === 'mcap' ? openPrice * TOTAL_SUPPLY : openPrice
            const open = openValue > 0 ? openValue : value
            candles.set(candleTime, {
                time: candleTime,
                open,
                high: Math.max(open, value),
                low: Math.min(open, value),
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
