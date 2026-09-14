'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getTokensForChain } from '@/lib/tokens'
import { isNativeToken } from '@/lib/wagmi'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { resolveLaunchpadLogo } from '@/lib/logo'
import { applyLaunchpadTokenOverride } from '@/lib/launchpad-token-config'
import { LAUNCH_TOKEN_META_FIELDS } from '@/lib/ponder-fields'
import { getBondingCurveDeployment, fetchLaunchTokens } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import { hasSettled } from '@/lib/query-status'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import { useV3Tokens } from '@/hooks/useV3Tokens'
import type { TokenType } from '@/types/portfolio'

export function useTokenDiscovery(chainId: number) {
    const staticTokens = useMemo(() => getTokensForChain(chainId), [chainId])
    const { tokens: graduatedTokens, isSettled: isGraduatedSettled } = useGraduatedTokens(chainId)
    const isLaunchpadChain = getBondingCurveDeployment(chainId) !== undefined
    const { tokens: v3Rows, isSettled: isV3Settled } = useV3Tokens(chainId)

    const v3Tokens = useMemo(
        () =>
            v3Rows
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
                ),
        [v3Rows, chainId]
    )

    const { data: bondingCurveTokens } = useQuery({
        queryKey: ['bonding-curve-tokens', chainId],
        queryFn: async () => {
            if (!isLaunchpadChain) return []
            try {
                const items = await fetchLaunchTokens(
                    ponderClient,
                    { chainId, isGraduated: 0 },
                    LAUNCH_TOKEN_META_FIELDS
                )
                return items
                    .map((raw) => applyLaunchpadTokenOverride(raw, chainId))
                    .map(
                        (t): Token => ({
                            address: t.tokenAddr as Address,
                            symbol: t.symbol || t.tokenAddr.slice(0, 6) + '...',
                            name: t.name || 'Unknown Token',
                            decimals: 18,
                            chainId,
                            logo: resolveLaunchpadLogo(t.logo) || undefined,
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
            for (const t of bondingCurveTokens ?? []) {
                const key = t.address.toLowerCase()
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
    const bondingCurveAddresses = useMemo(
        () => new Set((bondingCurveTokens ?? []).map((t) => t.address.toLowerCase())),
        [bondingCurveTokens]
    )

    const getTokenType = useMemo(
        () =>
            (token: Token): TokenType => {
                const key = token.address.toLowerCase()
                if (staticAddresses.has(key)) return 'static'
                if (graduatedAddresses.has(key)) return 'graduated'
                if (bondingCurveAddresses.has(key)) return 'bonding_curve'
                return 'static'
            },
        [staticAddresses, graduatedAddresses, bondingCurveAddresses]
    )

    const erc20Tokens = useMemo(
        () => allTokens.filter((t) => !isNativeToken(t.address)),
        [allTokens]
    )

    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative

    const isSettled =
        isGraduatedSettled && isV3Settled && hasSettled(isLaunchpadChain, bondingCurveTokens)

    return { allTokens, erc20Tokens, getTokenType, isLaunchpadChain, wrappedNative, isSettled }
}
