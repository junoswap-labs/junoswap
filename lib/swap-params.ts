import type { Token } from '@/types/tokens'
import type { SwapUrlParams, ParsedSwapUrlParams } from '@/types/swap'
import type { Address } from 'viem'
import { findTokenByAddress } from './tokens'
import { isNativeToken } from './wagmi'
import { isValidTokenAddress } from '@/services/tokens'

export function parseSwapSearchParams(searchParams: URLSearchParams): SwapUrlParams {
    return {
        input: searchParams.get('input') || undefined,
        output: searchParams.get('output') || undefined,
        amount: searchParams.get('amount') || undefined,
        chain: searchParams.get('chain') || undefined,
    }
}

export function buildSwapSearchParams(params: SwapUrlParams): URLSearchParams {
    const searchParams = new URLSearchParams()

    if (params.input) searchParams.set('input', params.input)
    if (params.output) searchParams.set('output', params.output)
    if (params.amount) searchParams.set('amount', params.amount)
    if (params.chain) searchParams.set('chain', params.chain)

    return searchParams
}

/**
 * Validate and resolve token address to Token object.
 *
 * `tokens` is the full, dynamic token list for the chain (static + graduated + V3).
 * The static list is checked first to preserve existing behavior; if the address
 * isn't there we fall back to the dynamic list so launchpad / Ponder V3 tokens
 * (which are never in the static lists) can resolve from shared links.
 */
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
        return findTokenByAddress(chainId, '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') || null
    }

    const staticMatch = findTokenByAddress(chainId, address)
    if (staticMatch) return staticMatch

    // Fall back to the dynamic list (graduated / V3 tokens, never in the static lists)
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

function parseChainId(chainParam: string | undefined): number | null {
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

    // Record invalid-token errors but still return partial state for the rest
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
