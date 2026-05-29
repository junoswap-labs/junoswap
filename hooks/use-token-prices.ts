'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { isNativeToken } from '@/lib/wagmi'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import type { Token } from '@/types/tokens'
import type { TokenType } from '@/types/portfolio'

const STABLECOIN_SYMBOLS = new Set(['USDT', 'USDC', 'USDC.E', 'KUSDT', 'JUSDT', 'DAI', 'BUSD'])

interface TokenSnapshotResponse {
    tokenSnapshots: {
        items: Array<{ tokenAddr: string; lastPriceUsd: string }>
    }
}

interface V3TokenSnapshotResponse {
    v3TokenSnapshots: {
        items: Array<{ tokenAddr: string; lastPriceUsd: string }>
    }
}

const TOKEN_SNAPSHOTS_QUERY = `
  query TokenSnapshots($addresses: [String!]) {
    tokenSnapshots(where: { tokenAddr_in: $addresses }, limit: 500) {
      items { tokenAddr lastPriceUsd }
    }
  }
`

const V3_TOKEN_SNAPSHOTS_QUERY = `
  query V3TokenSnapshots($chainId: Int!) {
    v3TokenSnapshots(where: { chainId: $chainId }, limit: 500) {
      items { tokenAddr lastPriceUsd }
    }
  }
`

export function useTokenPrices(
    tokens: Token[],
    chainId: number,
    nativeUsdPrice: number | null,
    getTokenType: (token: Token) => TokenType
) {
    const isLaunchpadChain = chainId === PUMP_CORE_NATIVE_CHAIN_ID

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

    const { data: snapshots } = useQuery({
        queryKey: ['token-snapshots-usd', bondingCurveAddresses],
        queryFn: async () => {
            if (!isLaunchpadChain || bondingCurveAddresses.length === 0) return []
            try {
                const data = await ponderRequest<TokenSnapshotResponse>(TOKEN_SNAPSHOTS_QUERY, {
                    addresses: bondingCurveAddresses,
                })
                return data.tokenSnapshots.items
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: isLaunchpadChain && bondingCurveAddresses.length > 0,
        staleTime: 30_000,
    })

    const { data: v3Snapshots } = useQuery({
        queryKey: ['v3-token-snapshots', chainId],
        queryFn: async () => {
            try {
                const data = await ponderRequest<V3TokenSnapshotResponse>(
                    V3_TOKEN_SNAPSHOTS_QUERY,
                    {
                        chainId,
                    }
                )
                return data.v3TokenSnapshots.items
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: hasV3Tokens,
        staleTime: 30_000,
    })

    const snapshotMap = useMemo(() => {
        const map = new Map<string, number>()
        for (const s of snapshots ?? []) {
            const price = parseFloat(s.lastPriceUsd)
            if (price > 0) map.set(s.tokenAddr.toLowerCase(), price)
        }
        return map
    }, [snapshots])

    const v3SnapshotMap = useMemo(() => {
        const map = new Map<string, number>()
        for (const s of v3Snapshots ?? []) {
            const price = parseFloat(s.lastPriceUsd)
            if (price > 0) map.set(s.tokenAddr.toLowerCase(), price)
        }
        return map
    }, [v3Snapshots])

    return useMemo(() => {
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
}

function isStablecoin(token: Token): boolean {
    return STABLECOIN_SYMBOLS.has(token.symbol.toUpperCase())
}

function isWrappedNative(token: Token, chainId: number): boolean {
    const wrapped = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    return !!wrapped && token.address.toLowerCase() === wrapped.toLowerCase()
}
