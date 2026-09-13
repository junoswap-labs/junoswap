import { getDexConfig, getSupportedDexs, ProtocolType } from '@coshi190/juno-moneta-sdk'
import {
    computePoolPrice,
    computeTickPrice,
    tickToSqrtPriceX96,
    type TickRange,
} from '@/lib/tick-math'

/** Fee tiers are hundredths of a bip, so 3000 renders as '0.30%'. */
export function formatFeeTier(fee: number): string {
    return `${(fee / 10000).toFixed(2)}%`
}

/** The tier the UI would rather trade, when nothing upstream has picked one. */
const PREFERRED_FEE_TIER = 3000

/** Stand-in for a chain whose V3 deployment we can't resolve; mirrors the tiers the SDK used to
 * hand back before fee tiers became a per-DEX config field. */
const FALLBACK_FEE_TIERS = [100, 500, 3000, 10000]

/**
 * `getDexConfig` falls back to the default DEX (junoswap) when no id is given, and junoswap has no
 * V3 on every chain — BSC is Pancake, Base and Worldchain are Uniswap. Ask for the chain's own V3
 * DEX before settling for that default, or these chains resolve to nothing.
 */
function v3ConfigForChain(chainId: number) {
    const [chainDexId] = getSupportedDexs(chainId, ProtocolType.V3)
    return getDexConfig(chainId, chainDexId, ProtocolType.V3)
}

/** The V3 fee tiers a chain actually offers. */
export function v3FeeTiers(chainId: number): number[] {
    const tiers = v3ConfigForChain(chainId)?.feeTiers
    return tiers?.length ? tiers : FALLBACK_FEE_TIERS
}

/**
 * The SDK no longer guesses a fee tier, and the tier list is per chain and per DEX — Pancake V3
 * runs 2500 and no 3000 — so the choice lands here: the tier nearest the preferred one that the
 * chain actually offers.
 */
export function defaultFeeTier(chainId: number): number {
    return v3FeeTiers(chainId).reduce((best, tier) =>
        Math.abs(tier - PREFERRED_FEE_TIER) < Math.abs(best - PREFERRED_FEE_TIER) ? tier : best
    )
}

/**
 * Display formatting only — the conversion itself routes through the SDK so this stays in step with
 * the TVL and chart paths. The sentinels and precision bands are what the position/pool UIs expect.
 */
export function formatPoolPrice(price: number): string {
    if (price < 1e-30) {
        return '0'
    }
    if (price > 1e35) {
        return '∞'
    }

    if (price < 0.0001) {
        return price.toExponential(4)
    } else if (price < 1) {
        return price.toPrecision(6)
    } else if (price < 10000) {
        return price.toFixed(4)
    } else {
        return price.toFixed(2)
    }
}

export function sqrtPriceX96ToPrice(
    sqrtPriceX96: bigint,
    decimals0: number,
    decimals1: number
): string {
    return formatPoolPrice(computePoolPrice({ sqrtPriceX96, decimals0, decimals1 }))
}

/** Display price at a tick, in the same formatting bands as {@link sqrtPriceX96ToPrice}. */
export function tickToPrice(tick: number, decimals0: number, decimals1: number): string {
    return formatPoolPrice(computeTickPrice({ tick, decimals0, decimals1 }))
}

/**
 * Below here is liquidity math the SDK no longer publishes. `computeDependentAmount` was the only
 * exported entry point, junoswap its only consumer, and the whole chain is pure arithmetic with no
 * chain access and no SDK state, so it lives here rather than behind the SDK's version boundary.
 */

const Q96 = 2n ** 96n

function getLiquidityForAmount0(
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    amount0: bigint
): bigint {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
        ;[sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
    }
    const intermediate = (sqrtPriceAX96 * sqrtPriceBX96) / Q96
    return (amount0 * intermediate) / (sqrtPriceBX96 - sqrtPriceAX96)
}

function getLiquidityForAmount1(
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    amount1: bigint
): bigint {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
        ;[sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
    }
    return (amount1 * Q96) / (sqrtPriceBX96 - sqrtPriceAX96)
}

function getAmount0ForLiquidity(
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    liquidity: bigint
): bigint {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
        ;[sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
    }
    return (liquidity * Q96 * (sqrtPriceBX96 - sqrtPriceAX96)) / sqrtPriceBX96 / sqrtPriceAX96
}

function getAmount1ForLiquidity(
    sqrtPriceAX96: bigint,
    sqrtPriceBX96: bigint,
    liquidity: bigint
): bigint {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
        ;[sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96]
    }
    return (liquidity * (sqrtPriceBX96 - sqrtPriceAX96)) / Q96
}

function calculateAmount1FromAmount0(
    sqrtPriceX96: bigint,
    sqrtPriceLowerX96: bigint,
    sqrtPriceUpperX96: bigint,
    amount0: bigint
): bigint {
    if (amount0 === 0n) return 0n

    if (sqrtPriceLowerX96 > sqrtPriceUpperX96) {
        ;[sqrtPriceLowerX96, sqrtPriceUpperX96] = [sqrtPriceUpperX96, sqrtPriceLowerX96]
    }

    if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        return 0n
    } else if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        return 0n
    } else {
        const liquidity = getLiquidityForAmount0(sqrtPriceX96, sqrtPriceUpperX96, amount0)
        return getAmount1ForLiquidity(sqrtPriceLowerX96, sqrtPriceX96, liquidity)
    }
}

function calculateAmount0FromAmount1(
    sqrtPriceX96: bigint,
    sqrtPriceLowerX96: bigint,
    sqrtPriceUpperX96: bigint,
    amount1: bigint
): bigint {
    if (amount1 === 0n) return 0n

    if (sqrtPriceLowerX96 > sqrtPriceUpperX96) {
        ;[sqrtPriceLowerX96, sqrtPriceUpperX96] = [sqrtPriceUpperX96, sqrtPriceLowerX96]
    }

    if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        return 0n
    } else if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        return 0n
    } else {
        const liquidity = getLiquidityForAmount1(sqrtPriceLowerX96, sqrtPriceX96, amount1)
        return getAmount0ForLiquidity(sqrtPriceX96, sqrtPriceUpperX96, liquidity)
    }
}

function mirrorRange(tickLower: number, tickUpper: number, invert: boolean | undefined): TickRange {
    if (!invert) return { tickLower, tickUpper }
    return { tickLower: -tickUpper, tickUpper: -tickLower }
}

export interface DependentAmountParams {
    sqrtPriceX96: bigint
    tickLower: number
    tickUpper: number
    amount: bigint
    side: 'token0' | 'token1'
    invert?: boolean
}

/**
 * The other side of a liquidity deposit: given one token amount and a range, how much of the other
 * token the position needs at the current price. Returns 0n when the price sits outside the range,
 * which is the single-sided case the deposit dialogs render as an empty field.
 *
 * `invert` means the caller's token0/token1 are reversed relative to canonical pool order, so both
 * the range and the requested side are mirrored back into pool orientation before the math runs.
 */
export function computeDependentAmount(params: DependentAmountParams): bigint {
    const { tickLower, tickUpper } = mirrorRange(params.tickLower, params.tickUpper, params.invert)
    const sqrtPriceLowerX96 = tickToSqrtPriceX96(tickLower)
    const sqrtPriceUpperX96 = tickToSqrtPriceX96(tickUpper)
    const poolSide = params.invert ? (params.side === 'token0' ? 'token1' : 'token0') : params.side

    if (poolSide === 'token0') {
        return calculateAmount1FromAmount0(
            params.sqrtPriceX96,
            sqrtPriceLowerX96,
            sqrtPriceUpperX96,
            params.amount
        )
    }
    return calculateAmount0FromAmount1(
        params.sqrtPriceX96,
        sqrtPriceLowerX96,
        sqrtPriceUpperX96,
        params.amount
    )
}
