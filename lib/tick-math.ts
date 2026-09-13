/**
 * Tick-math primitives the SDK no longer publishes. They were four lines of arithmetic with no
 * chain access and no SDK state, and junoswap was their only consumer, so they live here now
 * rather than behind the SDK's version boundary. The SDK still uses its own copies internally.
 */

export const MIN_TICK = -887272

export const MAX_TICK = 887272

/** Upper bound is exclusive: a position is out of range the moment the tick reaches tickUpper. */
export function isInRange(currentTick: number, tickLower: number, tickUpper: number): boolean {
    return currentTick >= tickLower && currentTick < tickUpper
}

/**
 * Pool token order is by ascending address, compared lowercased. Callers rely on the returned
 * tuple's identity to work out whether their own pair was reversed, so this hands back the
 * arguments themselves rather than copies.
 */
export function sortTokens<T extends { address: string }>(tokenA: T, tokenB: T): [T, T] {
    const addressA = tokenA.address.toLowerCase()
    const addressB = tokenB.address.toLowerCase()
    return addressA < addressB ? [tokenA, tokenB] : [tokenB, tokenA]
}

export interface TickRange {
    tickLower: number
    tickUpper: number
}

/**
 * Rounds to the nearest initializable tick, then pulls the result back inside the tick bounds so a
 * range snapped near the extremes stays mintable.
 */
function nearestUsableTick(tick: number, tickSpacing: number): number {
    const rounded = Math.round(tick / tickSpacing) * tickSpacing
    if (rounded < MIN_TICK) return MIN_TICK + (tickSpacing - (MIN_TICK % tickSpacing))
    if (rounded > MAX_TICK) return MAX_TICK - (MAX_TICK % tickSpacing)
    return rounded
}

/**
 * The returned upper bound is always at least one spacing above the lower one. The range slider
 * leans on that to never emit an inverted range as the two handles cross, and getPresetTickRange
 * leans on it the other way: it snaps a tick against itself purely to read tickLower back.
 */
export function snapTickRange(
    tickLower: number,
    tickUpper: number,
    tickSpacing: number
): TickRange {
    const snappedLower = nearestUsableTick(tickLower, tickSpacing)
    let snappedUpper = nearestUsableTick(tickUpper, tickSpacing)
    if (snappedUpper <= snappedLower) snappedUpper = snappedLower + tickSpacing
    return { tickLower: snappedLower, tickUpper: snappedUpper }
}

export function getFullRange(tickSpacing: number): TickRange {
    return {
        tickLower: nearestUsableTick(MIN_TICK, tickSpacing),
        tickUpper: nearestUsableTick(MAX_TICK, tickSpacing),
    }
}

/**
 * Full range is approximate on purpose. Aligning MIN_TICK and MAX_TICK to a spacing moves them
 * inwards by up to a spacing, so a position minted from getFullRange never sits exactly on the
 * bounds, and the slack is what still lets the positions list label it full range.
 */
const FULL_RANGE_TOLERANCE = 256

export function isFullRange(tickLower: number, tickUpper: number): boolean {
    return (
        tickLower <= MIN_TICK + FULL_RANGE_TOLERANCE && tickUpper >= MAX_TICK - FULL_RANGE_TOLERANCE
    )
}

const Q96 = 2n ** 96n

/** A price that isn't a positive number has no sqrt to take, so it clamps to the pool's floor. */
const MIN_SQRT_RATIO = 4295128739n

export interface InitialPriceParams {
    price: string
    decimals0: number
    decimals1: number
}

/**
 * Price is read as token1 per token0 in the caller's own token order. Pool order is settled later,
 * by buildPoolCreationMulticall inverting the sqrt price when the pair turns out to be reversed —
 * so this deliberately has no orientation flag of its own.
 */
export function computeInitialSqrtPriceX96(params: InitialPriceParams): bigint {
    const priceNum = parseFloat(params.price)
    // Negated rather than `<= 0` so an unparseable price lands on the floor too: NaN fails every
    // comparison, and BigInt() would throw on it a line later.
    if (!(priceNum > 0)) return MIN_SQRT_RATIO

    const adjustedPrice = priceNum * Math.pow(10, params.decimals1 - params.decimals0)
    return BigInt(Math.floor(Math.sqrt(adjustedPrice) * Number(Q96)))
}

/**
 * Below here is the pool-price math the SDK no longer publishes. Its three entry points were used
 * only by junoswap, and like the tick math above they are pure arithmetic over a sqrt price, so
 * they live here rather than behind the SDK's version boundary. The SDK keeps its own
 * `computePoolPrice` and `computeTickPrice` — those still have callers there, so they are copied
 * here rather than moved, and the two need to stay in step.
 */

export function tickToSqrtPriceX96(tick: number): bigint {
    const absTick = Math.abs(tick)
    let ratio: bigint

    if (absTick & 0x1) {
        ratio = 0xfffcb933bd6fad37aa2d162d1a594001n
    } else {
        ratio = 0x100000000000000000000000000000000n
    }
    if (absTick & 0x2) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n
    if (absTick & 0x4) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n
    if (absTick & 0x8) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n
    if (absTick & 0x10) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n
    if (absTick & 0x20) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n
    if (absTick & 0x40) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n
    if (absTick & 0x80) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n
    if (absTick & 0x100) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n
    if (absTick & 0x200) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n
    if (absTick & 0x400) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n
    if (absTick & 0x800) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n
    if (absTick & 0x1000) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n
    if (absTick & 0x2000) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n
    if (absTick & 0x4000) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n
    if (absTick & 0x8000) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n
    if (absTick & 0x10000) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n
    if (absTick & 0x20000) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n
    if (absTick & 0x40000) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n
    if (absTick & 0x80000) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n

    if (tick > 0) {
        ratio = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn / ratio
    }

    const sqrtPriceX96 = (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n)
    return sqrtPriceX96
}

function priceFromSqrtPriceX96(
    sqrtPriceX96: bigint,
    token0Decimals: number,
    token1Decimals: number
): number {
    if (sqrtPriceX96 <= 0n) return 0
    const SCALE = 10n ** 18n
    const rawX = (sqrtPriceX96 * sqrtPriceX96 * SCALE) / (Q96 * Q96)
    return (Number(rawX) / 1e18) * 10 ** (token0Decimals - token1Decimals)
}

function priceToTick(price: string, decimals0: number, decimals1: number): number {
    const priceNum = parseFloat(price)
    if (priceNum <= 0) return MIN_TICK

    const adjustedPrice = priceNum * Math.pow(10, decimals1 - decimals0)

    const tick = Math.floor(Math.log(adjustedPrice) / Math.log(1.0001))
    return Math.max(MIN_TICK, Math.min(MAX_TICK, tick))
}

function orient(price: number, invert: boolean | undefined): number {
    if (!invert) return price
    return price > 0 ? 1 / price : 0
}

export interface PoolPriceParams {
    sqrtPriceX96: bigint
    decimals0: number
    decimals1: number
    invert?: boolean
}

export interface TickPriceParams {
    tick: number
    decimals0: number
    decimals1: number
    invert?: boolean
}

export interface TickForPriceParams {
    price: string
    decimals0: number
    decimals1: number
    invert?: boolean
    tickSpacing?: number
}

export function computePoolPrice(params: PoolPriceParams): number {
    const price = priceFromSqrtPriceX96(params.sqrtPriceX96, params.decimals0, params.decimals1)
    return orient(price, params.invert)
}

export function computeTickPrice(params: TickPriceParams): number {
    return computePoolPrice({
        sqrtPriceX96: tickToSqrtPriceX96(params.tick),
        decimals0: params.decimals0,
        decimals1: params.decimals1,
        ...(params.invert === undefined ? {} : { invert: params.invert }),
    })
}

export function getTickForPrice(params: TickForPriceParams): number {
    const parsed = parseFloat(params.price)
    const oriented = params.invert && parsed > 0 ? 1 / parsed : parsed
    const tick = priceToTick(String(oriented), params.decimals0, params.decimals1)
    if (params.tickSpacing === undefined) return tick
    return nearestUsableTick(tick, params.tickSpacing)
}

export function invertSqrtPriceX96(sqrtPriceX96: bigint): bigint {
    if (sqrtPriceX96 <= 0n) return 0n
    return (Q96 * Q96) / sqrtPriceX96
}
