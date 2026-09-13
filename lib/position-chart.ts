import { computePoolPrice, computeTickPrice } from '@/lib/tick-math'

export interface PoolSwapPoint {
    timestamp: number
    sqrtPriceX96: string
}

export interface SeriesPoint {
    time: number
    price: number
}

export interface RangeChartDomain {
    yMin: number
    yMax: number
}

export const RANGE_CHART_WINDOW_SEC = 30 * 86_400
export const RANGE_CHART_BUCKET_SEC = 21_600

export function tickToPriceNumber(tick: number, decimals0: number, decimals1: number): number {
    return computeTickPrice({ tick, decimals0, decimals1 })
}

export function sqrtPriceX96ToPriceNumber(
    sqrtPriceX96: string,
    decimals0: number,
    decimals1: number
): number {
    let sqrt: bigint
    try {
        sqrt = BigInt(sqrtPriceX96)
    } catch {
        return 0
    }
    return computePoolPrice({ sqrtPriceX96: sqrt, decimals0, decimals1 })
}

export function buildPoolPriceSeries(params: {
    events: PoolSwapPoint[]
    anchor: PoolSwapPoint | null
    decimals0: number
    decimals1: number
    nowSec: number
    fallbackTick?: number
    windowSec?: number
    bucketSec?: number
}): SeriesPoint[] {
    const {
        events,
        anchor,
        decimals0,
        decimals1,
        nowSec,
        fallbackTick,
        windowSec = RANGE_CHART_WINDOW_SEC,
        bucketSec = RANGE_CHART_BUCKET_SEC,
    } = params

    const toPrice = (p: PoolSwapPoint) =>
        sqrtPriceX96ToPriceNumber(p.sqrtPriceX96, decimals0, decimals1)
    const usable = (price: number) => Number.isFinite(price) && price > 0

    const startBucket = Math.floor((nowSec - windowSec) / bucketSec) * bucketSec
    const endBucket = Math.floor(nowSec / bucketSec) * bucketSec

    const bucketClose = new Map<number, number>()
    for (const event of events) {
        const price = toPrice(event)
        if (!usable(price)) continue
        const bucket = Math.floor(event.timestamp / bucketSec) * bucketSec
        if (bucket < startBucket || bucket > endBucket) continue
        bucketClose.set(bucket, price)
    }

    let opening: number | undefined
    const anchorPrice = anchor ? toPrice(anchor) : 0
    if (usable(anchorPrice)) {
        opening = anchorPrice
    } else if (bucketClose.size > 0) {
        opening = bucketClose.get(Math.min(...bucketClose.keys()))
    } else if (fallbackTick !== undefined) {
        const tickPrice = tickToPriceNumber(fallbackTick, decimals0, decimals1)
        if (usable(tickPrice)) opening = tickPrice
    }
    if (opening === undefined) return []

    const series: SeriesPoint[] = []
    let prev = opening
    for (let t = startBucket; t <= endBucket; t += bucketSec) {
        prev = bucketClose.get(t) ?? prev
        series.push({ time: t, price: prev })
    }
    return series
}

export function computeRangeChartDomain(params: {
    prices: number[]
    priceLower?: number
    priceUpper?: number
    clampFactor?: number
    paddingPct?: number
}): RangeChartDomain {
    const { prices, priceLower, priceUpper, clampFactor = 2.5, paddingPct = 0.12 } = params

    let pMin = Infinity
    let pMax = -Infinity
    for (const p of prices) {
        if (!Number.isFinite(p)) continue
        pMin = Math.min(pMin, p)
        pMax = Math.max(pMax, p)
    }
    if (!Number.isFinite(pMin)) {
        pMin = priceLower ?? 0
        pMax = priceUpper ?? 1
    }

    const mid = (pMin + pMax) / 2
    let lo = pMin
    let hi = pMax
    if (priceLower !== undefined) {
        lo = Math.min(pMin, Math.max(priceLower, mid / clampFactor))
    }
    if (priceUpper !== undefined) {
        hi = Math.max(pMax, Math.min(priceUpper, mid * clampFactor))
    }

    if (hi <= lo) {
        lo *= 0.95
        hi = hi * 1.05 || 1
    }

    const pad = (hi - lo) * paddingPct
    return { yMin: Math.max(0, lo - pad), yMax: hi + pad }
}

export function priceToY(price: number, domain: RangeChartDomain, height: number): number {
    const span = domain.yMax - domain.yMin
    if (span <= 0) return height / 2
    return height - ((price - domain.yMin) / span) * height
}

export function buildLinePath(
    series: SeriesPoint[],
    domain: RangeChartDomain,
    width: number,
    height: number
): string {
    if (series.length === 0) return ''
    const t0 = series[0]!.time
    const t1 = series[series.length - 1]!.time
    const tSpan = t1 - t0
    const parts: string[] = []
    for (let i = 0; i < series.length; i++) {
        const { time, price } = series[i]!
        const x = tSpan > 0 ? ((time - t0) / tSpan) * width : width / 2
        const y = priceToY(price, domain, height)
        parts.push(`${i === 0 ? 'M' : 'L'}${round2(x)} ${round2(y)}`)
    }
    return parts.join(' ')
}

function round2(v: number): number {
    return Math.round(v * 100) / 100
}
