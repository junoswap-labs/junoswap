import type { Address } from 'viem'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isNativeToken } from '@/lib/wagmi'

export type SwapPairKind = 'native-stable' | 'token-native' | 'unsupported'

export interface SwapPairClassification {
    kind: SwapPairKind
    // For 'token-native': the non-native token whose price (denominated in native)
    // is charted from its v3SwapEvents.
    tokenAddr?: Address
}

/**
 * The swap-page chart can only price a pair the Ponder indexer keeps clean history for:
 *   - native↔stable → native (e.g. KKUB) priced in USD via nativeUsdPriceSnapshots
 *   - token↔native  → token priced in native via that token's v3SwapEvents
 * Anything else (token/token, stable/stable, token/stable-non-native, or native↔wrapped
 * native) is unsupported and the chart shows a graceful placeholder.
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

    // Exactly one side must be native to price against native/USD; native↔native
    // (e.g. KUB/KKUB) and token↔token both fail this and are unsupported.
    if (inNative === outNative) return { kind: 'unsupported' }

    const otherAddr = inNative ? tokenOutAddr : tokenInAddr

    if (isStableSide(otherAddr)) return { kind: 'native-stable' }

    return { kind: 'token-native', tokenAddr: otherAddr }
}
