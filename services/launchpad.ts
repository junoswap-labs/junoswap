import { formatEther, decodeEventLog } from 'viem'
import type { Address, Log } from 'viem'
import { PUMP_CORE_NATIVE_ADDRESS, PUMP_CORE_NATIVE_ABI } from '@/lib/abis/pump-core-native'

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
 * Mirrors PumpCoreNative.getAmountOut
 */
function getAmountOut(inputAmount: bigint, inputReserve: bigint, outputReserve: bigint): bigint {
    if (inputReserve <= 0n || outputReserve <= 0n) return 0n
    const inputAmountWithFee = inputAmount * 99n
    const numerator = outputReserve * inputAmountWithFee
    const denominator = inputReserve * 100n + inputAmountWithFee
    return numerator / denominator
}

/**
 * Calculate market cap in KUB
 * Market cap = nativeReserve * totalSupply / circulatingSupply
 * circulatingSupply = INITIALTOKEN - tokenReserve
 */
export function calculateMarketCap(
    nativeReserve: bigint,
    tokenReserve: bigint,
    totalSupply: bigint
): string {
    const circulatingSupply = totalSupply - tokenReserve
    if (circulatingSupply <= 0n) return '0'
    const marketCap = (nativeReserve * totalSupply) / circulatingSupply
    return formatEther(marketCap)
}

/**
 * Calculate graduation progress as percentage (0-100)
 */
export function calculateGraduationProgress(
    nativeReserve: bigint,
    graduationAmount: bigint
): number {
    if (graduationAmount <= 0n) return 0
    const progress = Number((nativeReserve * 100n) / graduationAmount)
    return Math.min(100, progress)
}

/**
 * Calculate minimum output with slippage tolerance
 */
export function calculateMinOutput(expectedOut: bigint, slippageBps: number): bigint {
    return (expectedOut * BigInt(10000 - slippageBps)) / 10000n
}

/**
 * Format KUB amount for display
 */
export function formatKub(weiValue: bigint): string {
    const formatted = formatEther(weiValue)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.0001) return '<0.0001'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    if (num < 1000000) return `${(num / 1000).toFixed(2)}K`
    return `${(num / 1000000).toFixed(2)}M`
}

/**
 * Format token amount for display (18 decimals)
 */
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

/**
 * Format a number compactly with zero decimals
 */
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
 * Get the createToken contract call config
 */
export function getCreateTokenConfig(form: {
    name: string
    symbol: string
    logo: string
    description: string
    link1: string
    link2: string
    link3: string
    createFee: bigint
}) {
    return {
        address: PUMP_CORE_NATIVE_ADDRESS as Address,
        abi: PUMP_CORE_NATIVE_ABI,
        functionName: 'createToken' as const,
        args: [
            form.name,
            form.symbol,
            form.logo,
            form.description,
            form.link1,
            form.link2,
            form.link3,
        ] as const,
        value: form.createFee,
    }
}

/**
 * Get the buy contract call config
 */
export function getBuyConfig(tokenAddr: Address, nativeAmount: bigint, minTokenOut: bigint) {
    return {
        address: PUMP_CORE_NATIVE_ADDRESS as Address,
        abi: PUMP_CORE_NATIVE_ABI,
        functionName: 'buy' as const,
        args: [tokenAddr, minTokenOut] as const,
        value: nativeAmount,
    }
}

/**
 * Get the sell contract call config
 */
export function getSellConfig(tokenAddr: Address, tokenAmount: bigint, minNativeOut: bigint) {
    return {
        address: PUMP_CORE_NATIVE_ADDRESS as Address,
        abi: PUMP_CORE_NATIVE_ABI,
        functionName: 'sell' as const,
        args: [tokenAddr, tokenAmount, minNativeOut] as const,
    }
}

/**
 * Extract the token address from Creation event logs.
 * The Creation event has `creator` indexed (topics[1]) and `tokenAddr` non-indexed (in data).
 */
export function parseTokenAddressFromLogs(logs: Log[]): Address | null {
    for (const log of logs) {
        if (log.address.toLowerCase() !== PUMP_CORE_NATIVE_ADDRESS.toLowerCase()) continue
        try {
            const decoded = decodeEventLog({
                abi: PUMP_CORE_NATIVE_ABI,
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
