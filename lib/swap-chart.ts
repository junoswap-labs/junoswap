import type { Address } from 'viem'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isNativeToken } from '@/lib/wagmi'

export type SwapPairKind =
    | 'native-stable'
    | 'token-native'
    | 'token-stable'
    | 'token-token'
    | 'unsupported'

export interface SwapPairClassification {
    kind: SwapPairKind
    /** Token charted as the numerator (its price is shown). */
    baseAddr?: Address
    /** Token the price is denominated in. */
    quoteAddr?: Address
}

/**
 * Classify a swap pair into how its price chart is sourced. Every non-native token has a
 * "native per token" series from its Junoswap V3 swaps (v3SwapEvents); a pair's price is
 * baseNP / quoteNP (native quote ⇒ 1). Kinds:
 *   - native↔stable → native priced in USD (richer nativeUsdPriceSnapshots path)
 *   - token↔native  → token priced in native
 *   - token↔stable  → token priced in the stable (≈ USD)
 *   - token↔token   → base (tokenIn) priced in quote (tokenOut)
 * native↔native, stable↔stable, and missing/unknown chains are unsupported.
 */
export function classifySwapPair(
    chainId: number,
    tokenInAddr: Address | undefined,
    tokenOutAddr: Address | undefined
): SwapPairClassification {
    if (!tokenInAddr || !tokenOutAddr) return { kind: 'unsupported' }

    const cfg = INTERMEDIARY_TOKENS[chainId]
    if (!cfg) return { kind: 'unsupported' }

    const wrappedNative = cfg.wrappedNative.toLowerCase()
    const stables = new Set(cfg.stables.map((s) => s.toLowerCase()))

    const isNativeSide = (addr: Address) =>
        isNativeToken(addr) || addr.toLowerCase() === wrappedNative
    const isStableSide = (addr: Address) => stables.has(addr.toLowerCase())

    const inNative = isNativeSide(tokenInAddr)
    const outNative = isNativeSide(tokenOutAddr)

    // native↔native (e.g. KUB/KKUB) has no price to show.
    if (inNative && outNative) return { kind: 'unsupported' }

    if (inNative || outNative) {
        const nativeAddr = inNative ? tokenInAddr : tokenOutAddr
        const otherAddr = inNative ? tokenOutAddr : tokenInAddr
        if (isStableSide(otherAddr)) {
            return { kind: 'native-stable', baseAddr: nativeAddr, quoteAddr: otherAddr }
        }
        return { kind: 'token-native', baseAddr: otherAddr, quoteAddr: nativeAddr }
    }

    // Neither side is native.
    const inStable = isStableSide(tokenInAddr)
    const outStable = isStableSide(tokenOutAddr)

    if (inStable && outStable) return { kind: 'unsupported' }

    if (inStable || outStable) {
        const stableAddr = inStable ? tokenInAddr : tokenOutAddr
        const tokenAddr = inStable ? tokenOutAddr : tokenInAddr
        return { kind: 'token-stable', baseAddr: tokenAddr, quoteAddr: stableAddr }
    }

    return { kind: 'token-token', baseAddr: tokenInAddr, quoteAddr: tokenOutAddr }
}
