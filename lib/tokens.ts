import type { Address } from 'viem'
import {
    ERC20_ABI,
    NATIVE_TOKEN_ADDRESS,
    getSwapAddress,
    getWrapOperation as getWrapOperationBySdk,
    getWrappedNativeAddress as getWrappedNativeAddressBySdk,
    isNativeToken,
} from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { QuoteResult } from '@/types/swap'
import { kubTestnet, jbc, bitkub, worldchain, base, bsc } from './wagmi'
import { resolveLaunchpadLogo } from './logo'
import tokenData from './tokens.json'

const KUSDT_ADDRESS = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as const

export function getAllowanceFunctionName(tokenAddress: Address): 'allowance' | 'allowances' {
    return tokenAddress.toLowerCase() === KUSDT_ADDRESS.toLowerCase() ? 'allowances' : 'allowance'
}

const CHAIN_ID_BY_SLUG: Record<string, number> = {
    kubTestnet: kubTestnet.id,
    bitkub: bitkub.id,
    jbc: jbc.id,
    worldchain: worldchain.id,
    base: base.id,
    bsc: bsc.id,
}

type RawToken = Omit<Token, 'chainId' | 'address'> & { address: string }

export const TOKEN_LISTS: Record<number, Token[]> = Object.fromEntries(
    Object.entries(tokenData as Record<string, RawToken[]>).map(([slug, tokens]) => {
        const chainId = CHAIN_ID_BY_SLUG[slug]
        return [
            chainId,
            tokens.map((t) => ({
                ...t,
                chainId,
                address: t.address as Address,
                logo: resolveLaunchpadLogo(t.logo),
            })),
        ]
    })
)

export function getTokensForChain(chainId: number): Token[] {
    return TOKEN_LISTS[chainId] || []
}

const STABLECOIN_SYMBOLS: Record<number, string> = {
    [kubTestnet.id]: 'KUSDT',
    [bitkub.id]: 'KUSDT',
    [jbc.id]: 'JUSDT',
    [bsc.id]: 'USDT',
    [worldchain.id]: 'USDC',
    [base.id]: 'USDC',
}

export function getDefaultPairTokens(chainId: number): {
    stablecoin: Token | undefined
    nativeTokens: Token[]
} {
    const tokens = TOKEN_LISTS[chainId] ?? []
    const native = tokens.find((t) => isNativeToken(t.address as Address))
    const wrappedNative = tokens[1] // wrapped native is always at index 1
    const stableSymbol = STABLECOIN_SYMBOLS[chainId]
    const stablecoin = stableSymbol ? tokens.find((t) => t.symbol === stableSymbol) : undefined
    const nativeTokens = [native, wrappedNative].filter((t): t is Token => !!t)
    return { stablecoin, nativeTokens }
}

export function findTokenByAddress(chainId: number, address: string): Token | undefined {
    const tokens = TOKEN_LISTS[chainId] || []
    if (isNativeToken(address as Address)) {
        return tokens.find((t) => t.address === NATIVE_TOKEN_ADDRESS)
    }
    return tokens.find((t) => t.address.toLowerCase() === address.toLowerCase())
}

export function buildInfiniteApprovalParams(tokenAddress: Address, spenderAddress: Address) {
    return {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve' as const,
        args: [spenderAddress, getMaxUint256()] as const,
    }
}

function getMaxUint256(): bigint {
    return 2n ** 256n - 1n
}

export function needsApproval(allowance: bigint, requiredAmount: bigint): boolean {
    return allowance < requiredAmount
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals)
    const whole = amount / divisor
    const fraction = amount % divisor

    if (fraction === 0n) {
        return whole.toString()
    }

    const fractionStr = fraction.toString().padStart(decimals, '0')
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

export function formatBalance(amount: bigint, decimals: number): string {
    const valueStr = formatTokenAmount(amount, decimals)
    const value = parseFloat(valueStr)

    if (value === 0) return '0'

    if (value > 0 && value < 0.000001) {
        const match = valueStr.match(/^0\.0*/)
        const leadingZeros = match ? match[0].length - 2 : 0
        const significant = valueStr.replace(/^0\.0*/, '').slice(0, 8)
        return `0.${'0'.repeat(leadingZeros)}${significant}`
    }

    if (value < 1) {
        return value.toFixed(6).replace(/\.?0+$/, '')
    }

    if (value < 1000) {
        return value.toFixed(4).replace(/\.?0+$/, '')
    }

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

export function parseTokenAmount(amount: string, decimals: number): bigint {
    const [whole = '0', fraction = '0'] = amount.split('.')
    const wholePart = BigInt(whole)
    const fractionPart = BigInt(fraction.padEnd(decimals, '0').slice(0, decimals))

    return wholePart * BigInt(10 ** decimals) + fractionPart
}

export function isValidTokenAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address)
}

export function findWrappedNativeAddress(chainId: number): Address | undefined {
    return getWrappedNativeAddressBySdk(chainId)
}

export function getWrappedNativeAddress(chainId: number): Address {
    const address = findWrappedNativeAddress(chainId)
    if (!address) {
        throw new Error(`No wrapped native token found for chain ${chainId}`)
    }
    return address
}

export function getDisplayToken(token: Token): Token {
    const tokens = TOKEN_LISTS[token.chainId]
    const native = tokens?.find((t) => isNativeToken(t.address as Address))
    const wrapped = tokens?.[1]
    if (native && wrapped && token.address.toLowerCase() === wrapped.address.toLowerCase()) {
        return { ...token, symbol: native.symbol, name: native.name }
    }
    return token
}

export { getSwapAddress }

export function isSameToken(tokenA: Token | null, tokenB: Token | null): boolean {
    if (!tokenA || !tokenB) return false
    if (tokenA.chainId !== tokenB.chainId) return false

    if (isNativeWrappedPair(tokenA, tokenB)) return false

    const addressA = getSwapAddress(tokenA.address as Address, tokenA.chainId)
    const addressB = getSwapAddress(tokenB.address as Address, tokenB.chainId)

    return addressA.toLowerCase() === addressB.toLowerCase()
}

function isNativeWrappedPair(tokenA: Token | null, tokenB: Token | null): boolean {
    return getWrapOperation(tokenA, tokenB) !== null
}

export function getWrapOperation(
    tokenIn: Token | null,
    tokenOut: Token | null
): 'wrap' | 'unwrap' | null {
    if (!tokenIn || !tokenOut) return null
    if (tokenIn.chainId !== tokenOut.chainId) return null

    return getWrapOperationBySdk(
        tokenIn.address as Address,
        tokenOut.address as Address,
        tokenIn.chainId
    )
}

export function wrapQuoteResult(amountIn: bigint, operation: 'wrap' | 'unwrap'): QuoteResult {
    return {
        amountOut: amountIn,
        sqrtPriceX96After: 0n,
        initializedTicksCrossed: 0,
        gasEstimate: operation === 'wrap' ? 50000n : 40000n,
    }
}
