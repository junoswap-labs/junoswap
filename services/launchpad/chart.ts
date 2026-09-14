import { formatEther } from 'viem'
import type { Timeframe, ChartMode, CandlestickData } from '@/types/chart'
import { TIMEFRAME_DURATIONS } from '@/types/chart'
import { computeCurve } from '@coshi190/juno-moneta-sdk'
import { computePoolPrice } from '@/lib/tick-math'
import { TOTAL_SUPPLY } from '@/lib/launchpad-curve'

const PUMP_FEE_BPS = 100n

function calculateVolume(event: CurveSwapEvent): number {
    return event.isBuy
        ? parseFloat(formatEther(event.amountIn))
        : parseFloat(formatEther(event.amountOut))
}

export function aggregateCandlesticks(
    events: CurveSwapEvent[],
    timeframe: Timeframe,
    mode: ChartMode = 'mcap'
): CandlestickData[] {
    if (events.length === 0) return []

    const duration = TIMEFRAME_DURATIONS[timeframe]
    const candles = new Map<number, CandlestickData>()

    for (const event of events) {
        const { price, marketCap, preSwapPrice, preSwapMarketCap } = computeCurve({
            nativeReserve: event.isBuy ? event.reserveIn : event.reserveOut,
            tokenReserve: event.isBuy ? event.reserveOut : event.reserveIn,
            swap: event,
        })
        const value = mode === 'mcap' ? marketCap : price
        const volume = calculateVolume(event)
        if (value <= 0) continue

        const candleTime = Math.floor(event.timestamp / duration) * duration

        const existing = candles.get(candleTime)
        if (!existing) {
            const openValue = mode === 'mcap' ? preSwapMarketCap : preSwapPrice
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

export const SAFE_CANDLE_VALUE_MAX = 9_000_000_000_000

export function sanitizeCandles(candles: CandlestickData[]): CandlestickData[] {
    const ok = (v: number) => Number.isFinite(v) && Math.abs(v) <= SAFE_CANDLE_VALUE_MAX
    return candles
        .filter((c) => ok(c.open) && ok(c.high) && ok(c.low) && ok(c.close))
        .map((c) => (ok(c.volume) ? c : { ...c, volume: 0 }))
}

export interface CurveSwapEvent {
    timestamp: number
    isBuy: boolean
    amountIn: bigint
    amountOut: bigint
    reserveIn: bigint
    reserveOut: bigint
    sender?: string
}

export interface V3SwapEvent {
    timestamp: number
    amount0: string
    amount1: string
    sqrtPriceX96: string
    tick: number
    txFrom?: string
    tokenIsToken0?: number
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
    // V3 swap events only carry the post-trade price, unlike bonding-curve events (which can
    // unwind to a true pre-trade price via calculatePreSwapPrice). So a bucket's open is taken
    // from the previous trade's close instead — otherwise a bucket with a single trade would
    // open/high/low/close on that one price and render as a flat, wick-less point.
    let prevTradeClose: number | null = null

    for (const event of events) {
        const sqrtPrice = BigInt(event.sqrtPriceX96)
        const price = computePoolPrice({
            sqrtPriceX96: sqrtPrice,
            decimals0: 18,
            decimals1: 18,
            invert: !tokenIsToken0,
        })
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
            const open = prevTradeClose ?? value
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
        prevTradeClose = value
    }

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
        // Graduation can gap hard between the bonding-curve close and the V3 pool's first
        // trade, so the bridged open can land outside this candle's own high/low — re-clamp
        // or the chart's price scale chokes on an open outside [low, high].
        firstPost.high = Math.max(firstPost.high, firstPost.open)
        firstPost.low = Math.min(firstPost.low, firstPost.open)
    }

    return [...preGrad, ...postGrad]
}

export interface CreatorTrade {
    timestamp: number
    isBuy: boolean
    nativeAmount: number // KUB spent (buy) or received (sell), ether units
    tokenAmount: number // launch tokens received (buy) or sold (sell), ether units
}

export interface CreatorMarkerPoint {
    time: number // candle bucket time (pre-toLocalChartTime)
    isBuy: boolean
    nativeAmount: number // summed over the bucket's same-side trades
    tokenAmount: number
    timestamp: number // latest real trade time in the bucket
}

function absBigInt(v: bigint): bigint {
    return v < 0n ? -v : v
}

export function extractCreatorTrades(
    bcEvents: Array<
        Pick<CurveSwapEvent, 'timestamp' | 'isBuy' | 'sender' | 'amountIn' | 'amountOut'>
    >,
    v3Events: Array<
        Pick<V3SwapEvent, 'timestamp' | 'amount0' | 'amount1' | 'txFrom' | 'tokenIsToken0'>
    >,
    creator: string,
    graduatedAt: number | null
): CreatorTrade[] {
    const target = creator.toLowerCase()
    const splitAt = graduatedAt !== null && v3Events.length > 0 ? graduatedAt : null

    const trades: CreatorTrade[] = []
    for (const e of bcEvents) {
        if (e.sender?.toLowerCase() !== target) continue
        if (splitAt !== null && e.timestamp >= splitAt) continue
        const nativeAmount = parseFloat(formatEther(e.isBuy ? e.amountIn : e.amountOut))
        const tokenAmount = parseFloat(formatEther(e.isBuy ? e.amountOut : e.amountIn))
        trades.push({ timestamp: e.timestamp, isBuy: e.isBuy, nativeAmount, tokenAmount })
    }
    if (splitAt !== null) {
        for (const e of v3Events) {
            if (e.txFrom?.toLowerCase() !== target) continue
            if (e.timestamp < splitAt) continue
            const tokenRaw = BigInt(e.tokenIsToken0 === 1 ? e.amount0 : e.amount1)
            const nativeRaw = BigInt(e.tokenIsToken0 === 1 ? e.amount1 : e.amount0)
            trades.push({
                timestamp: e.timestamp,
                isBuy: tokenRaw < 0n, // token leaving the pool → creator received tokens
                nativeAmount: parseFloat(formatEther(absBigInt(nativeRaw))),
                tokenAmount: parseFloat(formatEther(absBigInt(tokenRaw))),
            })
        }
    }
    return trades.sort((a, b) => a.timestamp - b.timestamp)
}

export function buildCreatorMarkers(
    trades: CreatorTrade[],
    timeframe: Timeframe,
    candleTimes: number[]
): CreatorMarkerPoint[] {
    if (trades.length === 0) return []

    const duration = TIMEFRAME_DURATIONS[timeframe]
    const rendered = new Set(candleTimes)
    const buckets = new Map<string, CreatorMarkerPoint>()

    for (const trade of trades) {
        const bucket = Math.floor(trade.timestamp / duration) * duration
        if (!rendered.has(bucket)) continue
        const key = `${bucket}:${trade.isBuy ? 'b' : 's'}`
        const existing = buckets.get(key)
        if (existing) {
            existing.nativeAmount += trade.nativeAmount
            existing.tokenAmount += trade.tokenAmount
            existing.timestamp = trade.timestamp // trades are time-sorted → latest wins
        } else {
            buckets.set(key, {
                time: bucket,
                isBuy: trade.isBuy,
                nativeAmount: trade.nativeAmount,
                tokenAmount: trade.tokenAmount,
                timestamp: trade.timestamp,
            })
        }
    }

    return Array.from(buckets.values()).sort((a, b) =>
        a.time === b.time ? Number(b.isBuy) - Number(a.isBuy) : a.time - b.time
    )
}

export interface FeeBreakdown {
    nativeFees: number // KUB collected from buy-side fees
    tokenFees: number // launch tokens collected from sell-side fees
    totalNative: number // KUB-denominated combined total (sell fees valued at the KUB received)
}

export function computeFeeBreakdown(events: CurveSwapEvent[]): FeeBreakdown {
    const feeRate = Number(PUMP_FEE_BPS) / 10000
    let nativeFees = 0
    let tokenFees = 0
    let totalNative = 0

    for (const e of events) {
        const amountIn = parseFloat(formatEther(e.amountIn))
        if (e.isBuy) {
            nativeFees += amountIn * feeRate
            totalNative += amountIn * feeRate
        } else {
            tokenFees += amountIn * feeRate
            totalNative += parseFloat(formatEther(e.amountOut)) * feeRate
        }
    }

    return { nativeFees, tokenFees, totalNative }
}

export interface DailyMetrics {
    volume1d: number
    priceChange1dPct: number
    feeBreakdown?: FeeBreakdown
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
