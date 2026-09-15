import type { Address } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { QuoteResult } from '@/types/swap'
import {
    kubTestnet,
    jbc,
    bitkub,
    worldchain,
    base,
    bsc,
    NATIVE_TOKEN_ADDRESS,
    isNativeToken,
} from './wagmi'
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

/** Addresses are lower-cased so callers can probe with a lower-cased needle. */
const STABLECOIN_ADDRESSES: Record<number, ReadonlySet<string>> = {
    [kubTestnet.id]: new Set(['0x70138f1b88bee73dd2cb06f24146f964dde6144e']),
    [bitkub.id]: new Set([
        '0x7d984c24d2499d840eb3b7016077164e15e5faa6',
        '0x21cdc3706b8c7b1836df0e533dd884069521350b',
        '0x31929a0fd776f971c5dd14bf03e1f9ff69d9c91c',
    ]),
    [jbc.id]: new Set([
        '0x24599b658b57f91e7643f4f154b16bcd2884f9ac',
        '0xfd8ef75c1cb00a594d02df48addc27414bd07f8a',
    ]),
    [worldchain.id]: new Set(['0x79a02482a880bce3f13e09da970dc34db4cd24d1']),
    [base.id]: new Set([
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
    ]),
    [bsc.id]: new Set([
        '0x55d398326f99059ff775485246999027b3197955',
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    ]),
}

export function getStablecoins(chainId: number): ReadonlySet<string> | undefined {
    return STABLECOIN_ADDRESSES[chainId]
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
        abi: getAbi('erc20'),
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

const WRAPPED_NATIVE_ADDRESSES: Record<number, Address> = {
    [kubTestnet.id]: '0x700d3ba307e1256e509ed3e45d6f9dff441d6907',
    [bitkub.id]: '0x67ebd850304c70d983b2d1b93ea79c7cd6c3f6b5',
    [jbc.id]: '0xc4b7c87510675167643e3de6eeed4d2c06a9e747',
    [worldchain.id]: '0x4200000000000000000000000000000000000006',
    [base.id]: '0x4200000000000000000000000000000000000006',
    [bsc.id]: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
}

export function findWrappedNativeAddress(chainId: number): Address | undefined {
    return WRAPPED_NATIVE_ADDRESSES[chainId]
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

export function getSwapAddress(token: Address, chainId: number): Address {
    if (!isNativeToken(token)) return token
    return findWrappedNativeAddress(chainId) ?? token
}

function isWrappedNative(token: Address, chainId: number): boolean {
    const wrapped = findWrappedNativeAddress(chainId)
    if (!wrapped) return false
    return token.toLowerCase() === wrapped.toLowerCase()
}

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

    const from = tokenIn.address as Address
    const to = tokenOut.address as Address
    const chainId = tokenIn.chainId

    if (isNativeToken(from) && isWrappedNative(to, chainId)) return 'wrap'
    if (isWrappedNative(from, chainId) && isNativeToken(to)) return 'unwrap'
    return null
}

export function wrapQuoteResult(amountIn: bigint, operation: 'wrap' | 'unwrap'): QuoteResult {
    return {
        amountOut: amountIn,
        sqrtPriceX96After: 0n,
        initializedTicksCrossed: 0,
        gasEstimate: operation === 'wrap' ? 50000n : 40000n,
    }
}
