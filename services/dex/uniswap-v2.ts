import { type Address } from 'viem'
import { getSwapAddress } from '@/services/tokens'
import { isNativeToken } from '@/lib/wagmi'

/**
 * Build swap path array for V2 router
 * V2 uses simple address[] path, no fee tiers
 *
 * @param wnative Optional DEX-specific wrapped native token address
 * Some DEXs (like jibswap) use their own wrapped native token instead of the chain's standard wrapped token
 */
export function buildSwapPath(
    tokenIn: Address,
    tokenOut: Address,
    chainId: number,
    wnative?: Address
): Address[] {
    const defaultSwapIn = getSwapAddress(tokenIn, chainId)
    const defaultSwapOut = getSwapAddress(tokenOut, chainId)

    // If DEX has custom wrapped native, use it for native tokens
    if (wnative) {
        const nativeIn = isNativeToken(tokenIn)
        const nativeOut = isNativeToken(tokenOut)
        return [nativeIn ? wnative : defaultSwapIn, nativeOut ? wnative : defaultSwapOut]
    }

    return [defaultSwapIn, defaultSwapOut]
}

/**
 * Build quote params for getAmountsOut call
 */
export function buildV2QuoteParams(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    chainId: number,
    wnative?: Address
) {
    return {
        amountIn,
        path: buildSwapPath(tokenIn, tokenOut, chainId, wnative),
    }
}

/**
 * V2 Swap parameters interface
 */
export interface V2SwapParams {
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    amountOutMinimum: bigint
    recipient: Address
    deadline: number
}

/**
 * Build swap params for Router02 swap functions
 */
export function buildV2SwapParams(params: V2SwapParams, chainId: number, wnative?: Address) {
    const path = buildSwapPath(params.tokenIn, params.tokenOut, chainId, wnative)
    return {
        amountIn: params.amountIn,
        amountOutMin: params.amountOutMinimum,
        path,
        to: params.recipient,
        deadline: BigInt(params.deadline),
    }
}

/**
 * Calculate minimum output with slippage
 * @param amountOut The expected output amount
 * @param slippageBasisPoints Slippage in basis points (100 = 1%)
 */
export function calculateMinOutput(amountOut: bigint, slippageBasisPoints: number): bigint {
    const slippageMultiplier = BigInt(10000 - slippageBasisPoints)
    return (amountOut * slippageMultiplier) / 10000n
}

// ============================================================================
// Multi-Hop Routing Functions
// ============================================================================

/**
 * Build multi-hop swap path array for V2 router
 * V2 uses simple address[] path for multi-hop
 *
 * @param tokens Array of token addresses in swap order
 * @param chainId Chain ID
 * @param wnative Optional DEX-specific wrapped native token address
 */
export function buildMultiHopSwapPath(
    tokens: Address[],
    chainId: number,
    wnative?: Address
): Address[] {
    return tokens.map((token) => {
        const isNative = isNativeToken(token)
        if (isNative && wnative) {
            return wnative
        }
        return getSwapAddress(token, chainId)
    })
}

/**
 * V2 Multi-hop Swap parameters interface
 */
export interface V2MultiHopSwapParams {
    path: Address[]
    amountIn: bigint
    amountOutMinimum: bigint
    recipient: Address
    deadline: number
}

/**
 * Build V2 swap params for multi-hop
 */
export function buildV2MultiHopSwapParams(
    params: V2MultiHopSwapParams,
    chainId: number,
    wnative?: Address
) {
    const path = buildMultiHopSwapPath(params.path, chainId, wnative)
    return {
        amountIn: params.amountIn,
        amountOutMin: params.amountOutMinimum,
        path,
        to: params.recipient,
        deadline: BigInt(params.deadline),
    }
}
