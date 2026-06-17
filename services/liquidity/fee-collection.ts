import { encodeFunctionData, type Address, type Hex } from 'viem'
import type { CollectCallParams } from '@/types/earn'
import { MAX_UINT128 } from '@/types/earn'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '@/lib/abis/nonfungible-position-manager'
import { getWrappedNativeAddress } from '@/services/tokens'
import { shouldSkipUnwrap } from '@/lib/wagmi'

/** MAX_UINT128 for amount0Max/amount1Max collects all accrued fees. */
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
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'collect',
        args: [params],
    })
}

function encodeUnwrapWETH9(amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'unwrapWETH9',
        args: [amountMinimum, recipient],
    })
}

function encodeSweepToken(token: Address, amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'sweepToken',
        args: [token, amountMinimum, recipient],
    })
}

/**
 * Build multicall for collecting fees with native token unwrapping
 * If one of the position's tokens is wrapped native (WETH, WKUB, etc.),
 * we need to unwrap it after collection.
 *
 * Sequence:
 * 1. collect - to address(0) to keep tokens in position manager
 * 2. unwrapWETH9 - unwrap the wrapped native token
 * 3. sweepToken - send the other token to recipient
 *
 * Note: For KUB Mainnet, we skip unwrapping to avoid KYC requirements.
 */
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

    // For KUB Mainnet, skip unwrapping and collect wrapped tokens directly
    // This avoids KYC requirements on the unwrapWETH9 function
    if (!hasWrappedNative || shouldSkipUnwrap(chainId)) {
        const collectParams = buildCollectFeesParams(tokenId, recipient)
        return [encodeCollect(collectParams)]
    }

    const data: Hex[] = []

    // 1. Collect to address(0) (keeps tokens in position manager)
    const collectParams: CollectCallParams = {
        tokenId,
        recipient: '0x0000000000000000000000000000000000000000' as Address,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128,
    }
    data.push(encodeCollect(collectParams))

    // 2. Unwrap the wrapped native token (use 0 as minimum, actual amount handled by contract)
    data.push(encodeUnwrapWETH9(0n, recipient))

    // 3. Sweep the other token (use 0 as minimum)
    const sweepToken = token0IsWrappedNative ? token1Address : token0Address
    data.push(encodeSweepToken(sweepToken, 0n, recipient))

    return data
}
