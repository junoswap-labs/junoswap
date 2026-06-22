import { formatEther, decodeEventLog } from 'viem'
import type { Address, Log } from 'viem'
import {
    BONDING_CURVE_JUNOSWAP_ADDRESS,
    BONDING_CURVE_JUNOSWAP_ABI,
} from '@/lib/abis/bonding-curve-junoswap'

const PUMP_FEE_BPS = 100n // 1%

/** Initial token supply: 1 billion with 18 decimals */
export const INITIAL_TOKEN_SUPPLY = 1000000000n * 10n ** 18n

/**
 * Calculate buy output amount (client-side, mirrors on-chain logic)
 * Buy uses virtualAmount + nativeReserve as input reserve
 */
export function calculateBuyOutput(
    nativeAmountIn: bigint,
    nativeReserve: bigint,
    tokenReserve: bigint,
    virtualAmount: bigint
): bigint {
    if (nativeAmountIn <= 0n || nativeReserve < 0n || tokenReserve <= 0n) return 0n
    const feeAmount = (nativeAmountIn * PUMP_FEE_BPS) / 10000n
    const amountInAfterFee = nativeAmountIn - feeAmount
    return getAmountOut(amountInAfterFee, virtualAmount + nativeReserve, tokenReserve)
}

/**
 * Calculate sell output amount (client-side, mirrors on-chain logic)
 * Sell uses virtualAmount + nativeReserve as output reserve
 */
export function calculateSellOutput(
    tokenAmountIn: bigint,
    nativeReserve: bigint,
    tokenReserve: bigint,
    virtualAmount: bigint
): bigint {
    if (tokenAmountIn <= 0n || tokenReserve <= 0n || nativeReserve <= 0n) return 0n
    const feeAmount = (tokenAmountIn * PUMP_FEE_BPS) / 10000n
    const amountInAfterFee = tokenAmountIn - feeAmount
    return getAmountOut(amountInAfterFee, tokenReserve, virtualAmount + nativeReserve)
}

/**
 * Constant-product AMM formula with 1% fee baked in
 * Mirrors BondingCurveJunoswap.getAmountOut
 */
function getAmountOut(inputAmount: bigint, inputReserve: bigint, outputReserve: bigint): bigint {
    if (inputReserve <= 0n || outputReserve <= 0n) return 0n
    const inputAmountWithFee = inputAmount * 99n
    const numerator = outputReserve * inputAmountWithFee
    const denominator = inputReserve * 100n + inputAmountWithFee
    return numerator / denominator
}

/**
 * Calculate the actual KUB target needed for graduation.
 * From the contract condition: tokenReserve * graduationAmount <= INITIAL_TOKEN * nativeReserve
 * Solving for nativeReserve: target = (tokenReserve * graduationAmount) / INITIAL_TOKEN
 */
export function calculateGraduationTarget(tokenReserve: bigint, graduationAmount: bigint): bigint {
    const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n
    if (graduationAmount <= 0n) return 0n
    return (tokenReserve * graduationAmount) / INITIAL_TOKEN
}

/**
 * Calculate graduation progress as percentage (0-100).
 * Uses the same ratio as the contract: (INITIAL_TOKEN * nativeReserve) / (tokenReserve * graduationAmount)
 */
export function calculateGraduationProgress(
    nativeReserve: bigint,
    tokenReserve: bigint,
    graduationAmount: bigint
): number {
    if (graduationAmount <= 0n || tokenReserve <= 0n) return 0
    const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n
    const progress = Number(
        (INITIAL_TOKEN * nativeReserve * 100n) / (tokenReserve * graduationAmount)
    )
    return Math.min(100, progress)
}

export function calculateMinOutput(expectedOut: bigint, slippageBps: number): bigint {
    return (expectedOut * BigInt(10000 - slippageBps)) / 10000n
}

export function formatKub(weiValue: bigint): string {
    const formatted = formatEther(weiValue)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.0001) return '<0.0001'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    if (num < 1000000) return num.toFixed(2)
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function formatTokenAmount(weiValue: bigint): string {
    const formatted = formatEther(weiValue)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.0001) return '<0.0001'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    if (num < 1000000) return `${(num / 1000).toFixed(2)}K`
    if (num < 1000000000) return `${(num / 1000000).toFixed(2)}M`
    return `${(num / 1000000000).toFixed(2)}B`
}

export function formatCompact(num: number): string {
    if (num === 0) return '0'
    if (num < 0.01) return '<0.01'
    if (num < 1) return num.toFixed(2)
    if (num < 1000) return num.toFixed(0)
    if (num < 1000000) return `${(num / 1000).toFixed(0)}K`
    if (num < 1000000000) return `${(num / 1000000).toFixed(0)}M`
    return `${(num / 1000000000).toFixed(0)}B`
}

/**
 * Check if token is ready to graduate.
 * Uses the same ratio check as the contract: tokenReserve / nativeReserve <= INITIALTOKEN / graduationAmount
 * Equivalent to: tokenReserve * graduationAmount <= INITIALTOKEN * nativeReserve
 */
export function isReadyToGraduate(
    nativeReserve: bigint,
    tokenReserve: bigint,
    graduationAmount: bigint,
    isGraduated: boolean
): boolean {
    if (isGraduated || graduationAmount === 0n) return false
    const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n
    return tokenReserve * graduationAmount <= INITIAL_TOKEN * nativeReserve
}

/**
 * Extract the token address from Creation event logs.
 * The Creation event has `creator` indexed (topics[1]) and `tokenAddr` non-indexed (in data).
 */
export function parseTokenAddressFromLogs(logs: Log[]): Address | null {
    for (const log of logs) {
        if (log.address.toLowerCase() !== BONDING_CURVE_JUNOSWAP_ADDRESS.toLowerCase()) continue
        try {
            const decoded = decodeEventLog({
                abi: BONDING_CURVE_JUNOSWAP_ABI,
                data: log.data,
                topics: log.topics,
            })
            if (decoded.eventName === 'Creation') {
                return (decoded.args as { tokenAddr: Address }).tokenAddr
            }
        } catch {
            continue
        }
    }
    return null
}
