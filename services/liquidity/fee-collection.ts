import { encodeFunctionData, type Address, type Hex } from 'viem'
import type { CollectCallParams } from '@/types/earn'
import { MAX_UINT128 } from '@/types/earn'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { getWrappedNativeAddress } from '@/lib/tokens'
import { shouldSkipUnwrap } from '@/lib/wagmi'

export function buildCollectFeesParams(tokenId: bigint, recipient: Address): CollectCallParams {
    return {
        tokenId,
        recipient,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128,
    }
}

function encodeCollect(params: CollectCallParams): Hex {
    return encodeFunctionData({
        abi: getAbi('positionManager'),
        functionName: 'collect',
        args: [params],
    })
}

function encodeUnwrapWETH9(amountMinimum: bigint, recipient: Address): Hex {
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

export function buildCollectWithUnwrapMulticall(
    tokenId: bigint,
    recipient: Address,
    token0Address: Address,
    token1Address: Address,
    chainId: number
): Hex[] {
    const wrappedNative = getWrappedNativeAddress(chainId)
    const token0IsWrappedNative = token0Address.toLowerCase() === wrappedNative.toLowerCase()
    const token1IsWrappedNative = token1Address.toLowerCase() === wrappedNative.toLowerCase()
    const hasWrappedNative = token0IsWrappedNative || token1IsWrappedNative

    if (!hasWrappedNative || shouldSkipUnwrap(chainId)) {
        const collectParams = buildCollectFeesParams(tokenId, recipient)
        return [encodeCollect(collectParams)]
    }

    const data: Hex[] = []

    const collectParams: CollectCallParams = {
        tokenId,
        recipient: '0x0000000000000000000000000000000000000000' as Address,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128,
    }
    data.push(encodeCollect(collectParams))

    data.push(encodeUnwrapWETH9(0n, recipient))

    const sweepToken = token0IsWrappedNative ? token1Address : token0Address
    data.push(encodeSweepToken(sweepToken, 0n, recipient))

    return data
}
