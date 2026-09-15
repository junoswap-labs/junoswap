import type { SwapUrlParams, ParsedSwapUrlParams } from '@/types/swap'
import type { Token } from '@/types/token'
import type { Address } from 'viem'
import { isNativeToken, NATIVE_TOKEN_ADDRESS } from '@/lib/wagmi'
import { findTokenByAddress, isValidTokenAddress } from './tokens'

export function parseSwapSearchParams(searchParams: URLSearchParams): SwapUrlParams {
    return {
        input: searchParams.get('input') || undefined,
        output: searchParams.get('output') || undefined,
        amount: searchParams.get('amount') || undefined,
        chain: searchParams.get('chain') || undefined,
        ref: searchParams.get('ref') || undefined,
    }
}

export function buildSwapSearchParams(params: SwapUrlParams): URLSearchParams {
    const searchParams = new URLSearchParams()

    if (params.input) searchParams.set('input', params.input)
    if (params.output) searchParams.set('output', params.output)
    if (params.amount) searchParams.set('amount', params.amount)
    if (params.chain) searchParams.set('chain', params.chain)
    if (params.ref) searchParams.set('ref', params.ref)

    return searchParams
}

function resolveTokenFromAddress(
    chainId: number,
    address: string | undefined,
    tokens?: Token[]
): Token | null {
    if (!address) return null

    if (!isValidTokenAddress(address)) {
        return null
    }

    if (isNativeToken(address as Address)) {
        return findTokenByAddress(chainId, NATIVE_TOKEN_ADDRESS) || null
    }

    const staticMatch = findTokenByAddress(chainId, address)
    if (staticMatch) return staticMatch

    if (tokens) {
        const lower = address.toLowerCase()
        return tokens.find((t) => t.address.toLowerCase() === lower) ?? null
    }

    return null
}

function validateAmountString(amount: string | undefined): string {
    if (!amount) return ''

    const trimmed = amount.trim()
    if (!trimmed) return ''

    return trimmed
}

export function parseChainId(chainParam: string | undefined): number | null {
    if (!chainParam) return null
    const parsed = parseInt(chainParam, 10)
    return isNaN(parsed) ? null : parsed
}

export function parseAndValidateSwapParams(
    chainId: number,
    urlParams: SwapUrlParams,
    tokens?: Token[]
): ParsedSwapUrlParams {
    const errors: string[] = []
    const targetChainId = parseChainId(urlParams.chain)
    const resolveChainId = targetChainId ?? chainId

    const tokenIn = resolveTokenFromAddress(resolveChainId, urlParams.input, tokens)
    const tokenOut = resolveTokenFromAddress(resolveChainId, urlParams.output, tokens)

    const amountIn = validateAmountString(urlParams.amount)

    if (urlParams.input && !tokenIn) {
        errors.push(`Input token address "${urlParams.input}" not found`)
    }
    if (urlParams.output && !tokenOut) {
        errors.push(`Output token address "${urlParams.output}" not found`)
    }

    if (tokenIn && tokenOut && tokenIn.address === tokenOut.address) {
        errors.push('Input and output tokens cannot be the same')
    }

    return {
        tokenIn,
        tokenOut,
        amountIn,
        targetChainId,
        isValid: errors.length === 0,
        errors,
    }
}
