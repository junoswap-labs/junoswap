'use client'

import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isNativeToken } from '@/lib/wagmi'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { hasSettled } from '@/lib/query-status'
import { fetchTokenSnapshots, fetchV3TokenSnapshots } from '@coshi190/juno-moneta-sdk'
import { getBondingCurveDeployment } from '@/lib/deployments'
import type { Token } from '@/types/token'
import type { TokenType } from '@/types/portfolio'

const STABLECOIN_SYMBOLS = new Set(['USDT', 'USDC', 'KUSDT', 'JUSDT', 'DAI', 'BUSD'])

export function useTokenPrices(
    tokens: Token[],
    chainId: number,
    nativeUsdPrice: number | null,
    getTokenType: (token: Token) => TokenType
) {
    const isLaunchpadChain = getBondingCurveDeployment(chainId) !== undefined

    const bondingCurveAddresses = useMemo(
        () =>
            tokens
                .filter((t) => !isNativeToken(t.address) && getTokenType(t) === 'bonding_curve')
                .map((t) => t.address.toLowerCase()),
        [tokens, getTokenType]
    )

    const hasV3Tokens = useMemo(
        () =>
            tokens.some((t) => {
                if (isNativeToken(t.address)) return false
                const tt = getTokenType(t)
                return (
                    tt === 'graduated' ||
                    (tt === 'static' && !isStablecoin(t) && !isWrappedNative(t, chainId))
                )
            }),
        [tokens, getTokenType, chainId]
    )

    const hasBondingCurveTokens = isLaunchpadChain && bondingCurveAddresses.length > 0

    const { data: snapshots, isLoading: isSnapshotsLoading } = useQuery({
        queryKey: ['token-snapshots-usd', bondingCurveAddresses],
        queryFn: async () => {
            if (!isLaunchpadChain || bondingCurveAddresses.length === 0) return []
            try {
                return await fetchTokenSnapshots(
                    ponderClient,
                    { tokenAddrs: bondingCurveAddresses },
                    ['tokenAddr', 'lastPriceUsd']
                )
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: hasBondingCurveTokens,
        staleTime: 30_000,
        placeholderData: keepPreviousData,
    })

    const { data: v3Snapshots, isLoading: isV3SnapshotsLoading } = useQuery({
        queryKey: ['v3-token-snapshots', chainId],
        queryFn: async () => {
            try {
                return await fetchV3TokenSnapshots(ponderClient, { chainId })
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: hasV3Tokens,
        staleTime: 30_000,
        placeholderData: keepPreviousData,
    })

    const snapshotMap = useMemo(() => {
        const map = new Map<string, number>()
        for (const s of snapshots ?? []) {
            const price = parseFloat(s.lastPriceUsd ?? '0')
            if (price > 0) map.set(s.tokenAddr.toLowerCase(), price)
        }
        return map
    }, [snapshots])

    const v3SnapshotMap = useMemo(() => {
        const map = new Map<string, number>()
        for (const s of v3Snapshots ?? []) {
            const price = parseFloat(s.lastPriceUsd ?? '0')
            if (price > 0) map.set(s.tokenAddr.toLowerCase(), price)
        }
        return map
    }, [v3Snapshots])

    const prices = useMemo(() => {
        const priceMap = new Map<string, number | null>()
        for (const token of tokens) {
            const key = token.address.toLowerCase()
            if (isNativeToken(token.address)) {
                priceMap.set(key, nativeUsdPrice)
            } else if (isWrappedNative(token, chainId)) {
                priceMap.set(key, nativeUsdPrice)
            } else if (isStablecoin(token)) {
                priceMap.set(key, 1.0)
            } else if (getTokenType(token) === 'bonding_curve') {
                priceMap.set(key, snapshotMap.get(key) ?? null)
            } else {
                priceMap.set(key, v3SnapshotMap.get(key) ?? null)
            }
        }
        return priceMap
    }, [tokens, getTokenType, nativeUsdPrice, chainId, snapshotMap, v3SnapshotMap])

    const isSettled =
        hasSettled(hasBondingCurveTokens, snapshots) && hasSettled(hasV3Tokens, v3Snapshots)

    return { prices, isLoading: isSnapshotsLoading || isV3SnapshotsLoading, isSettled }
}

export function isStablecoin(token: Token): boolean {
    return STABLECOIN_SYMBOLS.has(token.symbol.toUpperCase())
}

function isWrappedNative(token: Token, chainId: number): boolean {
    const wrapped = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    return !!wrapped && token.address.toLowerCase() === wrapped.toLowerCase()
}
