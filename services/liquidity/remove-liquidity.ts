import { encodeFunctionData, type Address, type Hex } from 'viem'
import type {
    RemoveLiquidityParams,
    DecreaseLiquidityCallParams,
    CollectCallParams,
} from '@/types/earn'
import { MAX_UINT128 } from '@/types/earn'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { getWrappedNativeAddress } from '@/lib/tokens'
import { shouldSkipUnwrap } from '@/lib/wagmi'

function buildDecreaseLiquidityParams(params: RemoveLiquidityParams): DecreaseLiquidityCallParams {
    return {
        tokenId: params.tokenId,
        liquidity: params.liquidity,
        amount0Min: params.amount0Min,
        amount1Min: params.amount1Min,
        deadline: params.deadline,
    }
}

function encodeDecreaseLiquidity(params: DecreaseLiquidityCallParams): Hex {
    return encodeFunctionData({
        abi: getAbi('positionManager'),
        functionName: 'decreaseLiquidity',
        args: [params],
    })
}

function encodeCollect(params: CollectCallParams): Hex {
    return encodeFunctionData({
        abi: getAbi('positionManager'),
        functionName: 'collect',
        args: [params],
    })
}

export function encodeUnwrapWETH9(amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: getAbi('positionManager'),
        functionName: 'unwrapWETH9',
        args: [amountMinimum, recipient],
    })
}

function encodeSweepToken(token: Address, amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: getAbi('positionManager'),
        functionName: 'sweepToken',
        args: [token, amountMinimum, recipient],
    })
}

export function buildRemoveWithCollectMulticall(
    decreaseParams: RemoveLiquidityParams,
    recipient: Address,
    token0Address: Address,
    token1Address: Address,
    chainId: number
): Hex[] {
    const data: Hex[] = []

    const decreaseCallParams = buildDecreaseLiquidityParams(decreaseParams)
    data.push(encodeDecreaseLiquidity(decreaseCallParams))

    const wrappedNative = getWrappedNativeAddress(chainId)
    const token0IsWrappedNative = token0Address.toLowerCase() === wrappedNative.toLowerCase()
    const token1IsWrappedNative = token1Address.toLowerCase() === wrappedNative.toLowerCase()
    const hasWrappedNative = token0IsWrappedNative || token1IsWrappedNative

    const skipUnwrap = shouldSkipUnwrap(chainId)

    if (hasWrappedNative && !skipUnwrap) {
        const collectParams: CollectCallParams = {
            tokenId: decreaseParams.tokenId,
            recipient: '0x0000000000000000000000000000000000000000' as Address, // collect to position manager
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128,
        }
        data.push(encodeCollect(collectParams))

        const unwrapAmount = token0IsWrappedNative
            ? decreaseParams.amount0Min
            : decreaseParams.amount1Min
        data.push(encodeUnwrapWETH9(unwrapAmount, recipient))

        const sweepToken = token0IsWrappedNative ? token1Address : token0Address
        const sweepAmount = token0IsWrappedNative
            ? decreaseParams.amount1Min
            : decreaseParams.amount0Min
        data.push(encodeSweepToken(sweepToken, sweepAmount, recipient))
    } else {
        const collectParams: CollectCallParams = {
            tokenId: decreaseParams.tokenId,
            recipient,
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128,
        }
        data.push(encodeCollect(collectParams))
    }

    return data
}
