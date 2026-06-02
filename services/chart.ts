import { formatEther } from 'viem'
import type { Timeframe, ChartMode, CandlestickData } from '@/types/chart'
import { TIMEFRAME_DURATIONS } from '@/types/chart'

const TOTAL_SUPPLY = 1_000_000_000 // 1 billion tokens
const VIRTUAL_AMOUNT = 3400n * 10n ** 18n
const Q96 = 2n ** 96n

interface SwapEvent {
    timestamp: number
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
}

function calculateMarketCapValue(event: SwapEvent): number {
    return calculatePrice(event) * TOTAL_SUPPLY
}

function calculatePrice(event: SwapEvent): number {
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

// --- V3 reserve-based chart functions ---

export interface V3SwapEvent {
    timestamp: number
    amount0: string
    amount1: string
    sqrtPriceX96: string
    tick: number
}

export function calculatePriceFromSqrtPrice(sqrtPriceX96: bigint, tokenIsToken0: boolean): number {
    if (sqrtPriceX96 === 0n) return 0
    let priceRaw: bigint
    if (tokenIsToken0) {
        priceRaw = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / (Q96 * Q96)
    } else {
        priceRaw = (Q96 * Q96 * 10n ** 18n) / (sqrtPriceX96 * sqrtPriceX96)
    }
    return Number(priceRaw) / 1e18
}

export function aggregateV3Candlesticks(
    events: V3SwapEvent[],
    timeframe: Timeframe,
    mode: ChartMode = 'mcap',
    tokenIsToken0: boolean
): CandlestickData[] {
    if (events.length === 0) return []

    const duration = TIMEFRAME_DURATIONS[timeframe]
    const candles = new Map<number, CandlestickData>()

    for (const event of events) {
        const sqrtPrice = BigInt(event.sqrtPriceX96)
        const price = calculatePriceFromSqrtPrice(sqrtPrice, tokenIsToken0)
        const value = mode === 'mcap' ? price * TOTAL_SUPPLY : price
        if (value <= 0) continue

        const amount0 = BigInt(event.amount0)
        const amount1 = BigInt(event.amount1)
        const absNative = tokenIsToken0
            ? amount1 < 0n
                ? -amount1
                : amount1
            : amount0 < 0n
              ? -amount0
              : amount0
        const volume = parseFloat(formatEther(absNative))

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

    // Forward-fill missing time buckets
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
            prevClose = candles.get(t)!.close
        }
    }

    return Array.from(candles.values()).sort((a, b) => a.time - b.time)
}

export function stitchCandlesticks(
    bondingCurveCandles: CandlestickData[],
    v3Candles: CandlestickData[],
    graduatedAtTimestamp: number | null
): CandlestickData[] {
    if (!graduatedAtTimestamp) return bondingCurveCandles
    if (v3Candles.length === 0) return bondingCurveCandles

    const preGrad = bondingCurveCandles.filter((c) => c.time < graduatedAtTimestamp)
    const postGrad = v3Candles.filter((c) => c.time >= graduatedAtTimestamp)

    if (preGrad.length > 0 && postGrad.length > 0) {
        const lastPre = preGrad[preGrad.length - 1]!
        const firstPost = postGrad[0]!
        firstPost.open = lastPre.close
    }

    return [...preGrad, ...postGrad]
}

export interface DailyMetrics {
    volume1d: number
    priceChange1dPct: number
}

export function computeDailyMetrics(
    candles: CandlestickData[],
    usdPrice: number | null
): DailyMetrics | null {
    if (candles.length === 0) return null

    const now = Math.floor(Date.now() / 1000)
    const cutoff = now - 86400

    let volume1d = 0
    for (const c of candles) {
        if (c.time >= cutoff) {
            volume1d += c.volume
        }
    }
    if (usdPrice !== null) {
        volume1d *= usdPrice
    }

    const sortedBefore = candles.filter((c) => c.time <= cutoff).sort((a, b) => b.time - a.time)
    const priceThen = sortedBefore.length > 0 ? sortedBefore[0]!.close : null

    const priceNow = candles[candles.length - 1]!.close

    let priceChange1dPct = 0
    if (priceThen !== null && priceThen > 0) {
        priceChange1dPct = ((priceNow - priceThen) / priceThen) * 100
    } else {
        const firstOpen = candles[0]!.open
        if (firstOpen > 0) {
            priceChange1dPct = ((priceNow - firstOpen) / firstOpen) * 100
        }
    }

    return { volume1d, priceChange1dPct }
}
