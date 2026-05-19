import { encodeFunctionData, type Address, type Hex } from 'viem'
import type {
    RemoveLiquidityParams,
    CollectFeesParams,
    DecreaseLiquidityCallParams,
    CollectCallParams,
} from '@/types/earn'
import { MAX_UINT128 } from '@/types/earn'
import { NONFUNGIBLE_POSITION_MANAGER_ABI } from '@/lib/abis/nonfungible-position-manager'
import { calculateDeadline } from '@/lib/liquidity-helpers'
import { getWrappedNativeAddress } from '@/services/tokens'
import { shouldSkipUnwrap } from '@/lib/wagmi'

/**
 * Build decrease liquidity parameters
 */
export function buildDecreaseLiquidityParams(
    params: RemoveLiquidityParams
): DecreaseLiquidityCallParams {
    return {
        tokenId: params.tokenId,
        liquidity: params.liquidity,
        amount0Min: params.amount0Min,
        amount1Min: params.amount1Min,
        deadline: calculateDeadline(params.deadline),
    }
}

/**
 * Build collect parameters
 */
export function buildCollectParams(params: CollectFeesParams): CollectCallParams {
    return {
        tokenId: params.tokenId,
        recipient: params.recipient,
        amount0Max: params.amount0Max,
        amount1Max: params.amount1Max,
    }
}

/**
 * Encode decreaseLiquidity function call
 */
export function encodeDecreaseLiquidity(params: DecreaseLiquidityCallParams): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'decreaseLiquidity',
        args: [params],
    })
}

/**
 * Encode collect function call
 */
export function encodeCollect(params: CollectCallParams): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'collect',
        args: [params],
    })
}

/**
 * Encode unwrapWETH9 function call
 */
export function encodeUnwrapWETH9(amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'unwrapWETH9',
        args: [amountMinimum, recipient],
    })
}

/**
 * Encode sweepToken function call (for leftover tokens)
 */
export function encodeSweepToken(token: Address, amountMinimum: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'sweepToken',
        args: [token, amountMinimum, recipient],
    })
}

/**
 * Build multicall for removing liquidity and collecting tokens
 * Sequence:
 * 1. decreaseLiquidity - removes liquidity, tokens stay in position manager
 * 2. collect - collect tokens to recipient (or address(this) if unwrapping)
 * 3. unwrapWETH9 - if one token is native, unwrap to native
 * 4. sweepToken - sweep remaining non-native token
 */
export function buildRemoveWithCollectMulticall(
    decreaseParams: RemoveLiquidityParams,
    recipient: Address,
    token0Address: Address,
    token1Address: Address,
    chainId: number
): Hex[] {
    const data: Hex[] = []

    // 1. Decrease liquidity
    const decreaseCallParams = buildDecreaseLiquidityParams(decreaseParams)
    data.push(encodeDecreaseLiquidity(decreaseCallParams))

    // Check if either token is native (wrapped)
    const wrappedNative = getWrappedNativeAddress(chainId)
    const token0IsWrappedNative = token0Address.toLowerCase() === wrappedNative.toLowerCase()
    const token1IsWrappedNative = token1Address.toLowerCase() === wrappedNative.toLowerCase()
    const hasWrappedNative = token0IsWrappedNative || token1IsWrappedNative

    // Check if we should skip unwrapping for this chain (KUB Mainnet has KYC on unwrap)
    const skipUnwrap = shouldSkipUnwrap(chainId)

    if (hasWrappedNative && !skipUnwrap) {
        // Standard behavior: unwrap to native token for most chains
        // Use address(0) as recipient for collect, then unwrap and sweep
        const collectParams: CollectCallParams = {
            tokenId: decreaseParams.tokenId,
            recipient: '0x0000000000000000000000000000000000000000' as Address, // collect to position manager
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128,
        }
        data.push(encodeCollect(collectParams))

        // Unwrap the wrapped native token
        const unwrapAmount = token0IsWrappedNative
            ? decreaseParams.amount0Min
            : decreaseParams.amount1Min
        data.push(encodeUnwrapWETH9(unwrapAmount, recipient))

        // Sweep the other token
        const sweepToken = token0IsWrappedNative ? token1Address : token0Address
        const sweepAmount = token0IsWrappedNative
            ? decreaseParams.amount1Min
            : decreaseParams.amount0Min
        data.push(encodeSweepToken(sweepToken, sweepAmount, recipient))
    } else {
        // For KUB Mainnet (skipUnwrap=true) or non-native tokens:
        // Collect wrapped tokens directly to recipient (no unwrapping)
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
