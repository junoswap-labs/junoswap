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
            prevClose = candles.get(t)!.close
        }
    }

    return Array.from(candles.values()).sort((a, b) => a.time - b.time)
}

export interface PricePoint {
    timestamp: number
    price: number
}

/**
 * Bucket spot-price points (e.g. native→USD snapshots) into sparse per-bucket OHLC:
 * open = first point in the bucket, close = last, high/low = extremes. Input must be
 * sorted ascending by timestamp. Price-only series, so candle volume is 0. No gap fill
 * or continuity here — pass the result through buildContinuousSeries for a render-ready
 * (connected, windowed) series.
 */
export function aggregatePricePoints(
    points: PricePoint[],
    timeframe: Timeframe
): CandlestickData[] {
    if (points.length === 0) return []

    const duration = TIMEFRAME_DURATIONS[timeframe]
    const candles = new Map<number, CandlestickData>()

    for (const point of points) {
        if (point.price <= 0) continue
        const candleTime = Math.floor(point.timestamp / duration) * duration
        const existing = candles.get(candleTime)
        if (!existing) {
            candles.set(candleTime, {
                time: candleTime,
                open: point.price,
                high: point.price,
                low: point.price,
                close: point.price,
                volume: 0,
            })
        } else {
            existing.high = Math.max(existing.high, point.price)
            existing.low = Math.min(existing.low, point.price)
            existing.close = point.price
        }
    }

    return Array.from(candles.values()).sort((a, b) => a.time - b.time)
}

/**
 * Turn sparse per-bucket candles into a continuous, render-ready series:
 *  - snaps each candle's open to the previous candle's close so bodies connect
 *    (no vertical jumps between candles),
 *  - flat-fills every missing time bucket at the prior close (no time holes),
 *  - extends flat from the last bucket to the current bucket (live right edge),
 *  - caps to the most recent `maxCandles` buckets, so a year of history at a fine
 *    timeframe can't expand into hundreds of thousands of candles.
 * Input must be sorted ascending by time.
 */
export function buildContinuousSeries(
    candles: CandlestickData[],
    timeframe: Timeframe,
    maxCandles = 500,
    nowSec: number = Math.floor(Date.now() / 1000)
): CandlestickData[] {
    if (candles.length === 0) return []

    const duration = TIMEFRAME_DURATIONS[timeframe]
    const byTime = new Map<number, CandlestickData>()
    for (const c of candles) byTime.set(c.time, c)

    const firstBucket = candles[0]!.time
    const lastBucket = candles[candles.length - 1]!.time
    const nowBucket = Math.floor(nowSec / duration) * duration
    const endTime = Math.max(lastBucket, nowBucket)
    const startTime = Math.max(firstBucket, endTime - (maxCandles - 1) * duration)

    // Seed prevClose from the last real candle strictly before the window so the first
    // emitted candle connects to prior (off-screen) price; if the window starts at the
    // first candle, open it at its own price.
    let prevClose: number | undefined
    for (const c of candles) {
        if (c.time < startTime) prevClose = c.close
        else break
    }
    if (prevClose === undefined) {
        const firstInWindow = candles.find((c) => c.time >= startTime)
        prevClose = firstInWindow ? firstInWindow.open : candles[0]!.close
    }

    const result: CandlestickData[] = []
    for (let t = startTime; t <= endTime; t += duration) {
        const real = byTime.get(t)
        if (real) {
            result.push({
                ...real,
                open: prevClose,
                high: Math.max(real.high, prevClose),
                low: Math.min(real.low, prevClose),
            })
            prevClose = real.close
        } else {
            result.push({
                time: t,
                open: prevClose,
                high: prevClose,
                low: prevClose,
                close: prevClose,
                volume: 0,
            })
        }
    }

    return result
}

// lightweight-charts rejects values outside ±~9.007e13. A V3 swap at a price-boundary
// sqrtPrice (or a degenerate/misattributed pool) can yield an absurd price (~2^128),
// which would throw when fed to the candlestick series. Drop candles whose OHLC falls
// outside a safe range and zero out a stray volume so one bad event can't crash the chart.
export const SAFE_CANDLE_VALUE_MAX = 9_000_000_000_000

export function sanitizeCandles(candles: CandlestickData[]): CandlestickData[] {
    const ok = (v: number) => Number.isFinite(v) && Math.abs(v) <= SAFE_CANDLE_VALUE_MAX
    return candles
        .filter((c) => ok(c.open) && ok(c.high) && ok(c.low) && ok(c.close))
        .map((c) => (ok(c.volume) ? c : { ...c, volume: 0 }))
}

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

/**
 * Continuous "native per token" candle series for a non-native token from its V3 swaps.
 * aggregateV3Candlesticks returns a raw smallest-unit ratio; rescale by the token/native
 * decimal difference so non-18-decimal tokens aren't off by 10^n, then make it render-ready.
 */
export function tokenNativeCandles(
    events: V3SwapEvent[],
    tokenAddr: string,
    tokenDecimals: number,
    wrappedNativeAddr: string,
    nativeDecimals: number,
    timeframe: Timeframe
): CandlestickData[] {
    const tokenIsToken0 = tokenAddr.toLowerCase() < wrappedNativeAddr.toLowerCase()
    const raw = aggregateV3Candlesticks(events, timeframe, 'price', tokenIsToken0)
    const factor = 10 ** (tokenDecimals - nativeDecimals)
    const scaled =
        factor === 1
            ? raw
            : raw.map((c) => ({
                  ...c,
                  open: c.open * factor,
                  high: c.high * factor,
                  low: c.low * factor,
                  close: c.close * factor,
              }))
    return buildContinuousSeries(sanitizeCandles(scaled), timeframe)
}

/**
 * Pair price from two "native per token" series: base / quote, inner-joined by bucket
 * time. high/low use the cross extremes (baseHigh/quoteLow, baseLow/quoteHigh). Buckets
 * absent from quote, or with a non-positive quote value, are skipped. Run the result
 * through sanitizeCandles + buildContinuousSeries before charting.
 */
export function ratioCandles(base: CandlestickData[], quote: CandlestickData[]): CandlestickData[] {
    const q = new Map(quote.map((c) => [c.time, c]))
    const out: CandlestickData[] = []
    for (const b of base) {
        const qc = q.get(b.time)
        if (!qc) continue
        if (qc.open <= 0 || qc.high <= 0 || qc.low <= 0 || qc.close <= 0) continue
        out.push({
            time: b.time,
            open: b.open / qc.open,
            high: b.high / qc.low,
            low: b.low / qc.high,
            close: b.close / qc.close,
            volume: 0,
        })
    }
    return out
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
