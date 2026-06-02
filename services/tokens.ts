import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { isNativeToken } from '@/lib/wagmi'
import { TOKEN_LISTS } from '@/lib/tokens'

/**
 * Build infinite approval parameters (use max uint256)
 */
export function buildInfiniteApprovalParams(tokenAddress: Address, spenderAddress: Address) {
    return {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve' as const,
        args: [spenderAddress, getMaxUint256()] as const,
    }
}

/**
 * Get max uint256 value for infinite approvals
 */
function getMaxUint256(): bigint {
    return 2n ** 256n - 1n
}

/**
 * Check if token needs approval based on allowance
 */
export function needsApproval(allowance: bigint, requiredAmount: bigint): boolean {
    return allowance < requiredAmount
}

/**
 * Format token amount to human-readable string
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals)
    const whole = amount / divisor
    const fraction = amount % divisor

    if (fraction === 0n) {
        return whole.toString()
    }

    // Pad fraction to correct decimal places
    const fractionStr = fraction.toString().padStart(decimals, '0')
    // Remove trailing zeros
    const trimmed = fractionStr.replace(/0+$/, '')

    return `${whole}.${trimmed}`
}

export function formatDisplayAmount(amount: bigint, decimals: number, maxDecimals = 6): string {
    const raw = formatTokenAmount(amount, decimals)
    const dotIndex = raw.indexOf('.')
    if (dotIndex === -1) return raw
    const truncated = raw.slice(0, dotIndex + 1 + maxDecimals)
    return truncated.replace(/\.?0+$/, '')
}

/**
 * Format token balance for UI display with smart notation
 * - Very small numbers (< 0.000001): Show up to 8 significant digits
 * - Small numbers (< 1): Max 6 decimals
 * - Medium numbers (< 1000): Max 4 decimals
 * - Large numbers (≥ 1000): Use K/M/B notation with 2 decimals
 */
export function formatBalance(amount: bigint, decimals: number): string {
    const valueStr = formatTokenAmount(amount, decimals)
    const value = parseFloat(valueStr)

    // Handle zero
    if (value === 0) return '0'

    // Very small positive numbers - show significant digits
    if (value > 0 && value < 0.000001) {
        // Keep leading zeros and show up to 8 significant digits
        const match = valueStr.match(/^0\.0*/)
        const leadingZeros = match ? match[0].length - 2 : 0
        const significant = valueStr.replace(/^0\.0*/, '').slice(0, 8)
        return `0.${'0'.repeat(leadingZeros)}${significant}`
    }

    // Small numbers - max 6 decimals
    if (value < 1) {
        return value.toFixed(6).replace(/\.?0+$/, '')
    }

    // Medium numbers - max 4 decimals
    if (value < 1000) {
        return value.toFixed(4).replace(/\.?0+$/, '')
    }

    // Large numbers - use K/M/B notation
    if (value >= 1000000000) {
        return `${(value / 1000000000).toFixed(2)}B`.replace(/\.?0+$/, '')
    }
    if (value >= 1000000) {
        return `${(value / 1000000).toFixed(2)}M`.replace(/\.?0+$/, '')
    }
    if (value >= 1000) {
        return `${(value / 1000).toFixed(2)}K`.replace(/\.?0+$/, '')
    }

    return value.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * Parse human-readable token amount to bigint
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
    const [whole = '0', fraction = '0'] = amount.split('.')
    const wholePart = BigInt(whole)
    const fractionPart = BigInt(fraction.padEnd(decimals, '0').slice(0, decimals))

    return wholePart * BigInt(10 ** decimals) + fractionPart
}

/**
 * Check if address is a valid token address
 */
export function isValidTokenAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Get wrapped native token address for a chain
 * Uses index 1 from TOKEN_LISTS (convention: index 0 = native, index 1 = wrapped)
 */
export function getWrappedNativeAddress(chainId: number): Address {
    const tokens = TOKEN_LISTS[chainId]
    if (!tokens || tokens.length < 2) {
        throw new Error(`No wrapped native token found for chain ${chainId}`)
    }
    return tokens[1]!.address as Address
}

/**
 * Get the address to use for DEX operations
 * Returns wrapped address for native tokens, original address otherwise
 */
export function getSwapAddress(tokenAddress: Address, chainId: number, wnative?: Address): Address {
    if (isNativeToken(tokenAddress)) {
        return wnative || getWrappedNativeAddress(chainId)
    }
    return tokenAddress
}

/**
 * Check if two tokens are the same (accounts for native → wrapped conversion)
 */
export function isSameToken(tokenA: Token | null, tokenB: Token | null): boolean {
    if (!tokenA || !tokenB) return false
    if (tokenA.chainId !== tokenB.chainId) return false

    // Native-wrapped pairs should be considered different for wrap/unwrap operations
    if (isNativeWrappedPair(tokenA, tokenB)) return false

    // Compare using swap addresses (handles native → wrapped conversion)
    const addressA = getSwapAddress(tokenA.address as Address, tokenA.chainId)
    const addressB = getSwapAddress(tokenB.address as Address, tokenB.chainId)

    return addressA.toLowerCase() === addressB.toLowerCase()
}

/**
 * Check if two tokens form a native-wrapped pair
 */
function isNativeWrappedPair(tokenA: Token | null, tokenB: Token | null): boolean {
    if (!tokenA || !tokenB) return false
    if (tokenA.chainId !== tokenB.chainId) return false

    const isANative = isNativeToken(tokenA.address as Address)
    const isBNative = isNativeToken(tokenB.address as Address)

    // Both native or both wrapped - not a native-wrapped pair
    if (isANative && isBNative) return false
    if (!isANative && !isBNative) return false

    // One is native, check if the other is the wrapped version
    const wrappedAddress = getWrappedNativeAddress(tokenA.chainId)
    const nonNativeAddress = isANative ? tokenB.address : tokenA.address

    return nonNativeAddress.toLowerCase() === wrappedAddress.toLowerCase()
}

/**
 * Determine wrap/unwrap operation type
 */
export function getWrapOperation(
    tokenIn: Token | null,
    tokenOut: Token | null
): 'wrap' | 'unwrap' | null {
    if (!isNativeWrappedPair(tokenIn, tokenOut)) return null

    const isInputNative = isNativeToken(tokenIn?.address as Address)
    return isInputNative ? 'wrap' : 'unwrap'
}
