'use client'

import { useMemo } from 'react'
import { getTokensForChain } from '@/lib/tokens'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import { useQuery } from '@tanstack/react-query'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import type { Token } from '@/types/tokens'
import type { Address } from 'viem'

interface TokenHolderResponse {
    tokenHolders: {
        items: Array<{
            tokenAddr: string
            balance: string
        }>
    }
}

interface LaunchTokenResponse {
    launchTokens: {
        items: Array<{
            tokenAddr: string
            name: string
            symbol: string
            logo: string
            isGraduated: number
        }>
    }
}

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

const USER_TOKENS_QUERY = `
  query UserTokens($address: String!) {
    tokenHolders(where: { address: $address }, limit: 100) {
      items {
        tokenAddr
        balance
      }
    }
  }
`

const LAUNCH_TOKENS_QUERY = `
  query LaunchTokens($addresses: [String!]) {
    launchTokens(where: { tokenAddr_in: $addresses }, limit: 100) {
      items {
        tokenAddr
        name
        symbol
        logo
        isGraduated
      }
    }
  }
`

const V3_TOKENS_QUERY = `
  query V3Tokens($chainId: Int!) {
    v3Tokens(where: { chainId: $chainId }, limit: 500) {
      items {
        id
        chainId
        address
        symbol
        name
        decimals
      }
    }
  }
`

export function usePortfolioTokens(chainId: number, userAddress?: Address) {
    const staticTokens = useMemo(() => getTokensForChain(chainId), [chainId])
    const { tokens: graduatedTokens } = useGraduatedTokens(chainId)

    const isLaunchpadChain = chainId === PUMP_CORE_NATIVE_CHAIN_ID

    // Fetch V3 tokens for the current chain from Ponder
    const { data: v3Tokens } = useQuery({
        queryKey: ['v3-tokens', chainId],
        queryFn: async () => {
            try {
                const data = await ponderRequest<V3TokenResponse>(V3_TOKENS_QUERY, {
                    chainId,
                })
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

    // Fetch user-held token addresses (launchpad chain only)
    const { data: userHeldTokenAddrs } = useQuery({
        queryKey: ['user-held-tokens', userAddress, chainId],
        queryFn: async () => {
            if (!userAddress || !isLaunchpadChain) return []
            try {
                const data = await ponderRequest<TokenHolderResponse>(USER_TOKENS_QUERY, {
                    address: userAddress.toLowerCase(),
                })
                return data.tokenHolders.items
                    .filter((h) => BigInt(h.balance) > 0n)
                    .map((h) => h.tokenAddr as Address)
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: !!userAddress && isLaunchpadChain,
        staleTime: 30_000,
    })

    // Build set of all known token addresses (static + graduated + v3)
    const knownAddrs = useMemo(() => {
        const set = new Set<string>()
        for (const t of staticTokens) set.add(t.address.toLowerCase())
        for (const t of graduatedTokens) set.add(t.address.toLowerCase())
        for (const t of v3Tokens ?? []) set.add(t.address.toLowerCase())
        return set
    }, [staticTokens, graduatedTokens, v3Tokens])

    // Find unknown tokens that the user holds but aren't in any known set
    const unknownAddrs = useMemo(
        () => (userHeldTokenAddrs ?? []).filter((addr) => !knownAddrs.has(addr.toLowerCase())),
        [userHeldTokenAddrs, knownAddrs]
    )

    // Fetch metadata for unknown tokens from Ponder launch_tokens
    const { data: launchTokenMeta } = useQuery({
        queryKey: ['launch-token-meta', unknownAddrs],
        queryFn: async () => {
            if (unknownAddrs.length === 0)
                return new Map<string, { name: string; symbol: string; logo: string }>()
            try {
                const data = await ponderRequest<LaunchTokenResponse>(LAUNCH_TOKENS_QUERY, {
                    addresses: unknownAddrs.map((a) => a.toLowerCase()),
                })
                const map = new Map<string, { name: string; symbol: string; logo: string }>()
                for (const t of data.launchTokens.items) {
                    map.set(t.tokenAddr.toLowerCase(), {
                        name: t.name ?? '',
                        symbol: t.symbol ?? '',
                        logo: t.logo ?? '',
                    })
                }
                return map
            } catch (e) {
                if (isPonderError(e))
                    return new Map<string, { name: string; symbol: string; logo: string }>()
                throw e
            }
        },
        enabled: unknownAddrs.length > 0 && isLaunchpadChain,
        staleTime: 60_000,
    })

    const tokens = useMemo<Token[]>(() => {
        const seen = new Set<string>()
        const merged: Token[] = []

        const addToken = (token: Token) => {
            const key = token.address.toLowerCase()
            if (!seen.has(key)) {
                seen.add(key)
                merged.push(token)
            }
        }

        for (const t of staticTokens) addToken(t)
        for (const t of graduatedTokens) addToken(t)
        for (const t of v3Tokens ?? []) addToken(t)

        if (isLaunchpadChain) {
            unknownAddrs.forEach((addr) => {
                const key = addr.toLowerCase()
                if (!seen.has(key)) {
                    seen.add(key)
                    const meta = launchTokenMeta?.get(key)
                    merged.push({
                        address: addr,
                        symbol: meta?.symbol || addr.slice(0, 6) + '...',
                        name: meta?.name || 'Unknown Token',
                        logo: meta?.logo || undefined,
                        decimals: 18,
                        chainId,
                    })
                }
            })
        }

        return merged
    }, [
        staticTokens,
        graduatedTokens,
        v3Tokens,
        unknownAddrs,
        launchTokenMeta,
        isLaunchpadChain,
        chainId,
    ])

    const staticAddresses = useMemo(
        () => new Set(staticTokens.map((t) => t.address.toLowerCase())),
        [staticTokens]
    )
    const graduatedAddresses = useMemo(
        () => new Set(graduatedTokens.map((t) => t.address.toLowerCase())),
        [graduatedTokens]
    )

    const getTokenType = (token: Token): 'static' | 'graduated' | 'bonding_curve' => {
        const key = token.address.toLowerCase()
        if (staticAddresses.has(key)) return 'static'
        if (graduatedAddresses.has(key)) return 'graduated'
        return 'bonding_curve'
    }

    return { tokens, getTokenType, isLaunchpadChain }
}
