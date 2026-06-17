import { type Address } from 'viem'
import { getSwapAddress } from '@/services/tokens'
import { isNativeToken } from '@/lib/wagmi'

/**
 * `wnative` overrides the chain's standard wrapped-native address — some DEXs (e.g. jibswap)
 * use their own wrapped native token, so native legs must route through it instead.
 */
function buildSwapPath(
    tokenIn: Address,
    tokenOut: Address,
    chainId: number,
    wnative?: Address
): Address[] {
    const defaultSwapIn = getSwapAddress(tokenIn, chainId)
    const defaultSwapOut = getSwapAddress(tokenOut, chainId)

    if (wnative) {
        const nativeIn = isNativeToken(tokenIn)
        const nativeOut = isNativeToken(tokenOut)
        return [nativeIn ? wnative : defaultSwapIn, nativeOut ? wnative : defaultSwapOut]
    }

    return [defaultSwapIn, defaultSwapOut]
}

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

interface V2SwapParams {
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    amountOutMinimum: bigint
    recipient: Address
    deadline: number
}

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

/** slippageBasisPoints is in basis points (100 = 1%). */
export function calculateMinOutput(amountOut: bigint, slippageBasisPoints: number): bigint {
    const slippageMultiplier = BigInt(10000 - slippageBasisPoints)
    return (amountOut * slippageMultiplier) / 10000n
}

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

interface V2MultiHopSwapParams {
    path: Address[]
    amountIn: bigint
    amountOutMinimum: bigint
    recipient: Address
    deadline: number
}

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
