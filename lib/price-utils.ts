import { formatEther } from 'viem'

/**
 * Calculate the price of a token from a swap event.
 * For buys: price = amountIn / amountOut (native per token)
 * For sells: price = amountOut / amountIn (native per token)
 */
export function calculatePrice(isBuy: boolean, amountIn: bigint, amountOut: bigint): number {
    if (amountIn === 0n || amountOut === 0n) return 0
    const inNum = parseFloat(formatEther(amountIn))
    const outNum = parseFloat(formatEther(amountOut))
    if (outNum === 0 || inNum === 0) return 0
    return isBuy ? inNum / outNum : outNum / inNum
}
