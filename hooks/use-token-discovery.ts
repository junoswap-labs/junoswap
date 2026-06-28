'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getTokensForChain } from '@/lib/tokens'
import { isNativeToken } from '@/lib/wagmi'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { isLaunchpadChain as isLaunchpadChainFn } from '@/lib/abis/bonding-curve-junoswap'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import type { Token } from '@/types/tokens'
import type { TokenType } from '@/types/portfolio'

interface V3TokenResponse {
    v3Tokens: {
        items: Array<{
            id: string
            chainId: number
            address: string
            symbol: string
            name: string
            decimals: number
        }>
    }
}

interface BondingCurveTokenResponse {
    launchTokens: {
        items: Array<{
            tokenAddr: string
            name: string
            symbol: string
            logo: string
        }>
    }
}

const V3_TOKENS_QUERY = `
  query V3Tokens($chainId: Int!) {
    v3Tokens(where: { chainId: $chainId }, limit: 500) {
      items {
        id chainId address symbol name decimals
      }
    }
  }
`

const BONDING_CURVE_TOKENS_QUERY = `
  query BondingCurveTokens($chainId: Int!) {
    launchTokens(where: { isGraduated: 0, chainId: $chainId }) {
      items { tokenAddr name symbol logo }
    }
  }
`

export function useTokenDiscovery(chainId: number) {
    const staticTokens = useMemo(() => getTokensForChain(chainId), [chainId])
    const { tokens: graduatedTokens } = useGraduatedTokens(chainId)
    const isLaunchpadChain = isLaunchpadChainFn(chainId)

    const { data: v3Tokens } = useQuery({
        queryKey: ['v3-tokens', chainId],
        queryFn: async () => {
            try {
                const data = await ponderRequest<V3TokenResponse>(V3_TOKENS_QUERY, { chainId })
                return data.v3Tokens.items
                    .filter((t) => t.symbol || t.name)
                    .map(
                        (t): Token => ({
                            address: t.address as Address,
                            symbol: t.symbol || '???',
                            name: t.name || '',
                            decimals: t.decimals || 18,
                            chainId,
                            logo: undefined,
                        })
                    )
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        staleTime: 60_000,
    })

    const { data: bondingCurveTokens } = useQuery({
        queryKey: ['bonding-curve-tokens', chainId],
        queryFn: async () => {
            if (!isLaunchpadChain) return []
            try {
                const data = await ponderRequest<BondingCurveTokenResponse>(
                    BONDING_CURVE_TOKENS_QUERY,
                    { chainId }
                )
                return data.launchTokens.items.map(
                    (t): Token => ({
                        address: t.tokenAddr as Address,
                        symbol: t.symbol || t.tokenAddr.slice(0, 6) + '...',
                        name: t.name || 'Unknown Token',
                        decimals: 18,
                        chainId,
                        logo: t.logo ?? undefined,
                    })
                )
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: isLaunchpadChain,
        staleTime: 60_000,
    })

    const allTokens = useMemo<Token[]>(() => {
        const seen = new Set<string>()
        const merged: Token[] = []
        const add = (token: Token) => {
            const key = token.address.toLowerCase()
            if (!seen.has(key)) {
                seen.add(key)
                merged.push(token)
            }
        }
        for (const t of staticTokens) add(t)
        for (const t of graduatedTokens) add(t)
        for (const t of v3Tokens ?? []) add(t)
        if (isLaunchpadChain) {
            // Only add bonding curve tokens not already known
            for (const t of bondingCurveTokens ?? []) {
                const key = t.address.toLowerCase()
                // Skip if it's already in static/graduated/v3
                if (!seen.has(key)) add(t)
            }
        }
        return merged
    }, [staticTokens, graduatedTokens, v3Tokens, bondingCurveTokens, isLaunchpadChain])

    const staticAddresses = useMemo(
        () => new Set(staticTokens.map((t) => t.address.toLowerCase())),
        [staticTokens]
    )
    const graduatedAddresses = useMemo(
        () => new Set(graduatedTokens.map((t) => t.address.toLowerCase())),
        [graduatedTokens]
    )

    const getTokenType = useMemo(
        () =>
            (token: Token): TokenType => {
                const key = token.address.toLowerCase()
                if (staticAddresses.has(key)) return 'static'
                if (graduatedAddresses.has(key)) return 'graduated'
                // The launchpad is only deployed on specific chains; off those
                // chains an unrecognized token is never a bonding-curve token.
                return isLaunchpadChain ? 'bonding_curve' : 'static'
            },
        [staticAddresses, graduatedAddresses, isLaunchpadChain]
    )

    const erc20Tokens = useMemo(
        () => allTokens.filter((t) => !isNativeToken(t.address)),
        [allTokens]
    )

    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative

    return { allTokens, erc20Tokens, getTokenType, isLaunchpadChain, wrappedNative }
}
