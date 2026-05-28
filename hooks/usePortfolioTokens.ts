'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { useTokenDiscovery } from '@/hooks/use-token-discovery'
import type { Token } from '@/types/tokens'

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

const USER_TOKENS_QUERY = `
  query UserTokens($address: String!) {
    tokenHolders(where: { address: $address }, limit: 100) {
      items { tokenAddr balance }
    }
  }
`

const LAUNCH_TOKENS_QUERY = `
  query LaunchTokens($addresses: [String!]) {
    launchTokens(where: { tokenAddr_in: $addresses }, limit: 100) {
      items { tokenAddr name symbol logo isGraduated }
    }
  }
`

export function usePortfolioTokens(chainId: number, userAddress?: Address) {
    const {
        allTokens: discoveredTokens,
        getTokenType,
        isLaunchpadChain,
    } = useTokenDiscovery(chainId)

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

    // Build set of all discovered token addresses
    const knownAddrs = useMemo(() => {
        const set = new Set<string>()
        for (const t of discoveredTokens) set.add(t.address.toLowerCase())
        return set
    }, [discoveredTokens])

    // Find unknown tokens that the user holds
    const unknownAddrs = useMemo(
        () => (userHeldTokenAddrs ?? []).filter((addr) => !knownAddrs.has(addr.toLowerCase())),
        [userHeldTokenAddrs, knownAddrs]
    )

    // Fetch metadata for unknown tokens
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
        if (!isLaunchpadChain || unknownAddrs.length === 0) return discoveredTokens

        const seen = new Set(discoveredTokens.map((t) => t.address.toLowerCase()))
        const merged = [...discoveredTokens]

        for (const addr of unknownAddrs) {
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
        }

        return merged
    }, [discoveredTokens, unknownAddrs, launchTokenMeta, isLaunchpadChain, chainId])

    return { tokens, getTokenType, isLaunchpadChain }
}
