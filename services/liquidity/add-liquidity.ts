import { encodeFunctionData, type Address, type Hex } from 'viem'
import type {
    AddLiquidityParams,
    IncreaseLiquidityParams,
    MintCallParams,
    IncreaseLiquidityCallParams,
} from '@/types/earn'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '@/lib/abis/nonfungible-position-manager'
import {
    calculateMinAmounts,
    calculateDeadline,
    sortTokens,
    nearestUsableTick,
    getTickSpacing,
} from '@/lib/liquidity-helpers'
import { isNativeToken } from '@/lib/wagmi'
import { getWrappedNativeAddress } from '@/services/tokens'

/**
 * Build mint parameters for creating a new liquidity position
 */
export function buildMintParams(params: AddLiquidityParams): MintCallParams {
    // Sort tokens - V3 requires token0 < token1
    const [token0, token1] = sortTokens(params.token0, params.token1)
    const isToken0First = token0.address === params.token0.address

    // Get amounts in correct order
    const amount0Desired = isToken0First ? params.amount0Desired : params.amount1Desired
    const amount1Desired = isToken0First ? params.amount1Desired : params.amount0Desired

    // For adding liquidity, set minimums to 0
    // The contract determines actual amounts based on current price, which can differ
    // significantly from desired amounts when price moves. Setting minimums to 0:
    // 1. Allows the transaction to succeed with current price
    // 2. The simulation catches any issues before submitting
    // 3. Excess tokens are not taken (refunded for native tokens)
    const amount0Min = 0n
    const amount1Min = 0n

    // Ensure ticks are properly aligned
    const tickSpacing = getTickSpacing(params.fee)
    const tickLower = nearestUsableTick(params.tickLower, tickSpacing)
    const tickUpper = nearestUsableTick(params.tickUpper, tickSpacing)

    return {
        token0: token0.address,
        token1: token1.address,
        fee: params.fee,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient: params.recipient,
        deadline: BigInt(params.deadline),
    }
}

/**
 * Build increase liquidity parameters for an existing position
 */
export function buildIncreaseLiquidityParams(
    params: IncreaseLiquidityParams
): IncreaseLiquidityCallParams {
    const { amount0Min, amount1Min } = calculateMinAmounts(
        params.amount0Desired,
        params.amount1Desired,
        params.slippageTolerance
    )

    return {
        tokenId: params.tokenId,
        amount0Desired: params.amount0Desired,
        amount1Desired: params.amount1Desired,
        amount0Min,
        amount1Min,
        deadline: calculateDeadline(params.deadline),
    }
}

/**
 * Encode mint function call
 */
function encodeMint(params: MintCallParams): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'mint',
        args: [params],
    })
}

/**
 * Encode increaseLiquidity function call
 */
function encodeIncreaseLiquidity(params: IncreaseLiquidityCallParams): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'increaseLiquidity',
        args: [params],
    })
}

/**
 * Encode createAndInitializePoolIfNecessary function call
 */
function encodeCreateAndInitializePool(
    token0: Address,
    token1: Address,
    fee: number,
    sqrtPriceX96: bigint
): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'createAndInitializePoolIfNecessary',
        args: [token0, token1, fee, sqrtPriceX96],
    })
}

/**
 * Encode refundETH function call
 */
function encodeRefundETH(): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'refundETH',
        args: [],
    })
}

/**
 * Build multicall data for minting with native token
 * When adding liquidity with native token (ETH/KUB), we need to:
 * 1. Call mint with wrapped native address
 * 2. Call refundETH to return excess native token
 */
export function buildMintWithNativeMulticall(
    params: AddLiquidityParams,
    chainId: number
): { data: Hex[]; value: bigint } {
    const token0IsNative = isNativeToken(params.token0.address)
    const token1IsNative = isNativeToken(params.token1.address)

    if (!token0IsNative && !token1IsNative) {
        // No native token, single mint call
        const mintParams = buildMintParams(params)
        return {
            data: [encodeMint(mintParams)],
            value: 0n,
        }
    }

    // Replace native token with wrapped version
    const wrappedNative = getWrappedNativeAddress(chainId)
    const modifiedParams = { ...params }

    let nativeAmount = 0n
    if (token0IsNative) {
        modifiedParams.token0 = { ...params.token0, address: wrappedNative }
        nativeAmount = params.amount0Desired
    }
    if (token1IsNative) {
        modifiedParams.token1 = { ...params.token1, address: wrappedNative }
        nativeAmount = params.amount1Desired
    }

    const mintParams = buildMintParams(modifiedParams)

    return {
        data: [encodeMint(mintParams), encodeRefundETH()],
        value: nativeAmount,
    }
}

/**
 * Build multicall data for creating a new pool and minting the first position
 * Bundles: createAndInitializePoolIfNecessary + mint + refundETH (if native token)
 */
export function buildPoolCreationMulticall(
    params: AddLiquidityParams,
    chainId: number,
    sqrtPriceX96: bigint
): { data: Hex[]; value: bigint } {
    const wrappedNative = getWrappedNativeAddress(chainId)
    const token0IsNative = isNativeToken(params.token0.address)
    const token1IsNative = isNativeToken(params.token1.address)

    // Sort tokens for createAndInitializePoolIfNecessary (must be sorted by address)
    const [sortedToken0, sortedToken1] = sortTokens(
        { address: params.token0.address },
        { address: params.token1.address }
    )

    // sqrtPriceX96 is computed in terms of the user's token0/token1 order.
    // If sortTokens reversed the order, the price direction is inverted —
    // invert sqrtPriceX96 so it matches the pool's actual token0/token1 layout.
    const isReversed = sortedToken0.address.toLowerCase() !== params.token0.address.toLowerCase()
    const Q96 = 2n ** 96n
    const finalSqrtPriceX96 = isReversed ? (Q96 * Q96) / sqrtPriceX96 : sqrtPriceX96

    // Use wrapped native address for pool creation
    const poolToken0 =
        token0IsNative && sortedToken0.address.toLowerCase() === params.token0.address.toLowerCase()
            ? wrappedNative
            : sortedToken0.address
    const poolToken1 =
        token1IsNative && sortedToken1.address.toLowerCase() === params.token1.address.toLowerCase()
            ? wrappedNative
            : sortedToken1.address

    const createPoolData = encodeCreateAndInitializePool(
        poolToken0 as Address,
        poolToken1 as Address,
        params.fee,
        finalSqrtPriceX96
    )

    // Build mint data (handles native token wrapping and refundETH)
    const { data: mintData, value } = buildMintWithNativeMulticall(params, chainId)

    return {
        data: [createPoolData, ...mintData],
        value,
    }
}

/**
 * Build multicall data for increasing liquidity with native token
 */
export function buildIncreaseLiquidityWithNativeMulticall(
    params: IncreaseLiquidityParams,
    hasNativeToken: boolean,
    nativeAmount: bigint
): { data: Hex[]; value: bigint } {
    const increaseParams = buildIncreaseLiquidityParams(params)

    if (!hasNativeToken) {
        return {
            data: [encodeIncreaseLiquidity(increaseParams)],
            value: 0n,
        }
    }

    return {
        data: [encodeIncreaseLiquidity(increaseParams), encodeRefundETH()],
        value: nativeAmount,
    }
}
