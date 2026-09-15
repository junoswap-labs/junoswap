'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchLaunchTokens } from '@coshi190/juno-moneta-sdk'
import { getBondingCurveDeployment } from '@/lib/deployments'
import type { Token } from '@/types/token'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { LAUNCH_TOKEN_META_FIELDS } from '@/lib/ponder-fields'
import { resolveLaunchpadLogo } from '@/lib/logo'
import { applyLaunchpadTokenOverride } from '@/lib/launchpad-token-config'
import { hasSettled } from '@/lib/query-status'

export function useGraduatedTokens(chainId: number): {
    tokens: Token[]
    isLoading: boolean
    isSettled: boolean
} {
    const launchpadChain = getBondingCurveDeployment(chainId) !== undefined

    const { data: tokens, isLoading } = useQuery({
        queryKey: ['graduated-tokens', chainId],
        queryFn: async () => {
            try {
                const items = await fetchLaunchTokens(
                    ponderClient,
                    { chainId, isGraduated: 1 },
                    LAUNCH_TOKEN_META_FIELDS,
                    { orderBy: 'graduatedAt', orderDirection: 'desc' }
                )
                return items
                    .map((raw) => applyLaunchpadTokenOverride(raw, chainId))
                    .map(
                        (t): Token => ({
                            address: t.tokenAddr as Address,
                            symbol: t.symbol || '???',
                            name: t.name || '',
                            decimals: 18,
                            chainId,
                            logo: resolveLaunchpadLogo(t.logo),
                        })
                    )
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: launchpadChain,
        staleTime: 60_000,
    })

    if (!launchpadChain) {
        return { tokens: [], isLoading: false, isSettled: true }
    }

    return { tokens: tokens ?? [], isLoading, isSettled: hasSettled(true, tokens) }
}
