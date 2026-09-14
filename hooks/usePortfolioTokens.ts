'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchTokenHolders, fetchLaunchTokens } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { resolveLaunchpadLogo } from '@/lib/logo'
import { applyLaunchpadTokenOverride } from '@/lib/launchpad-token-config'
import { hasSettled } from '@/lib/query-status'
import { useTokenDiscovery } from '@/hooks/useTokenDiscovery'

const CARD_FIELDS = ['tokenAddr', 'name', 'symbol', 'logo', 'isGraduated'] as const

const HOLDER_BALANCE_FIELDS = ['tokenAddr', 'balance'] as const

export function usePortfolioTokens(chainId: number, userAddress?: Address) {
    const {
        allTokens: discoveredTokens,
        getTokenType,
        isLaunchpadChain,
        isSettled: isDiscoverySettled,
    } = useTokenDiscovery(chainId)

    const { data: userHeldTokenAddrs } = useQuery({
        queryKey: ['user-held-tokens', userAddress, chainId],
        queryFn: async () => {
            if (!userAddress || !isLaunchpadChain) return []
            try {
                const holdings = await fetchTokenHolders(
                    ponderClient,
                    { address: userAddress },
                    HOLDER_BALANCE_FIELDS
                )
                return holdings
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

    const knownAddrs = useMemo(() => {
        const set = new Set<string>()
        for (const t of discoveredTokens) set.add(t.address.toLowerCase())
        return set
    }, [discoveredTokens])

    const unknownAddrs = useMemo(
        () => (userHeldTokenAddrs ?? []).filter((addr) => !knownAddrs.has(addr.toLowerCase())),
        [userHeldTokenAddrs, knownAddrs]
    )

    const { data: launchTokenMeta } = useQuery({
        queryKey: ['launch-token-meta', chainId, unknownAddrs],
        queryFn: async () => {
            if (unknownAddrs.length === 0)
                return new Map<string, { name: string; symbol: string; logo: string }>()
            try {
                const rows = await fetchLaunchTokens(
                    ponderClient,
                    { tokenAddrs: unknownAddrs },
                    CARD_FIELDS
                )
                const map = new Map<string, { name: string; symbol: string; logo: string }>()
                for (const raw of rows) {
                    const t = applyLaunchpadTokenOverride(raw, chainId)
                    map.set(t.tokenAddr.toLowerCase(), {
                        name: t.name ?? '',
                        symbol: t.symbol ?? '',
                        logo: resolveLaunchpadLogo(t.logo),
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

    const isSettled =
        isDiscoverySettled &&
        hasSettled(!!userAddress && isLaunchpadChain, userHeldTokenAddrs) &&
        hasSettled(unknownAddrs.length > 0 && isLaunchpadChain, launchTokenMeta)

    return { tokens, getTokenType, isLaunchpadChain, isSettled }
}
