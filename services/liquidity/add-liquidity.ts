import { encodeFunctionData, type Address, type Hex } from 'viem'
import type {
    AddLiquidityParams,
    IncreaseLiquidityParams,
    MintCallParams,
    IncreaseLiquidityCallParams,
} from '@/types/earn'
import {
    NONFUNGIBLE_POSITION_MANAGER_ABI,
    getTickSpacing,
    planAddLiquidity,
    planIncreaseLiquidity,
} from '@coshi190/juno-moneta-sdk'
import { invertSqrtPriceX96, sortTokens } from '@/lib/tick-math'
import { isNativeToken } from '@/lib/wagmi'
import { getWrappedNativeAddress } from '@/lib/tokens'

export function buildMintParams(params: AddLiquidityParams): MintCallParams {
    const plan = planAddLiquidity({
        token0: params.token0,
        token1: params.token1,
        fee: params.fee,
        tickSpacing: getTickSpacing(params.fee),
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        amount0Desired: params.amount0Desired,
        amount1Desired: params.amount1Desired,
        slippageBps: params.slippageTolerance,
        deadlineMinutes: 0,
    })

    return {
        token0: plan.token0 as Address,
        token1: plan.token1 as Address,
        fee: plan.fee,
        tickLower: plan.tickLower,
        tickUpper: plan.tickUpper,
        amount0Desired: plan.amount0Desired,
        amount1Desired: plan.amount1Desired,
        // Mint has always gone out without min amounts; slippageTolerance is applied on
        // increase only. Tightening it here would change revert behaviour, not just shape.
        amount0Min: 0n,
        amount1Min: 0n,
        recipient: params.recipient,
        deadline: BigInt(params.deadline),
    }
}

export function buildIncreaseLiquidityParams(
    params: IncreaseLiquidityParams
): IncreaseLiquidityCallParams {
    const plan = planIncreaseLiquidity({
        tokenId: params.tokenId,
        amount0Desired: params.amount0Desired,
        amount1Desired: params.amount1Desired,
        slippageBps: params.slippageTolerance,
        deadlineMinutes: params.deadline,
    })

    return {
        tokenId: plan.tokenId,
        amount0Desired: plan.amount0Desired,
        amount1Desired: plan.amount1Desired,
        amount0Min: plan.amount0Min,
        amount1Min: plan.amount1Min,
        deadline: plan.deadline,
    }
}

function encodeMint(params: MintCallParams): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'mint',
        args: [params],
    })
}

function encodeIncreaseLiquidity(params: IncreaseLiquidityCallParams): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'increaseLiquidity',
        args: [params],
    })
}

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

function encodeRefundETH(): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'refundETH',
        args: [],
    })
}

export function buildMintWithNativeMulticall(
    params: AddLiquidityParams,
    chainId: number
): { data: Hex[]; value: bigint } {
    const token0IsNative = isNativeToken(params.token0.address)
    const token1IsNative = isNativeToken(params.token1.address)

    if (!token0IsNative && !token1IsNative) {
        const mintParams = buildMintParams(params)
        return {
            data: [encodeMint(mintParams)],
            value: 0n,
        }
    }

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

export function buildPoolCreationMulticall(
    params: AddLiquidityParams,
    chainId: number,
    sqrtPriceX96: bigint
): { data: Hex[]; value: bigint } {
    const wrappedNative = getWrappedNativeAddress(chainId)
    const token0IsNative = isNativeToken(params.token0.address)
    const token1IsNative = isNativeToken(params.token1.address)

    const [sortedToken0, sortedToken1] = sortTokens(
        { address: params.token0.address },
        { address: params.token1.address }
    )

    const isReversed = sortedToken0.address.toLowerCase() !== params.token0.address.toLowerCase()
    const finalSqrtPriceX96 = isReversed ? invertSqrtPriceX96(sqrtPriceX96) : sqrtPriceX96

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

    const { data: mintData, value } = buildMintWithNativeMulticall(params, chainId)

    return {
        data: [createPoolData, ...mintData],
        value,
    }
}

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
