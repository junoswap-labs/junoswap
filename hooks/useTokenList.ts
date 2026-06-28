'use client'

import { useQuery } from '@tanstack/react-query'
import { useChainId } from 'wagmi'
import type { Address } from 'viem'
import { isLaunchpadChain } from '@/lib/abis/bonding-curve-junoswap'
import { ponderRequest } from '@/lib/ponder-client'
import type { LaunchToken } from '@/types/launchpad'

const TOKEN_LIST_QUERY = `
  query TokenList($chainId: Int!) {
    launchTokens(where: { chainId: $chainId }, orderBy: "createdTime", orderDirection: "desc") {
      items {
        tokenAddr
        creator
        name
        symbol
        logo
        description
        link1
        link2
        link3
        createdTime
        isGraduated
        graduatedAt
      }
    }
    tokenSnapshots(where: { chainId: $chainId }) {
      items {
        tokenAddr
        lastSwapAt
        marketCapNative
        athMarketCapNative
        lastPrice
        price1dAgoTimestamp
        priceChange1dPct
      }
    }
  }
`

const STALENESS_TOLERANCE = 3600 // 1 hour — hide badge if reference price is >1h before the 24h mark

interface TokenListResponse {
    launchTokens: {
        items: Array<{
            tokenAddr: string
            creator: string
            name: string
            symbol: string
            logo: string
            description: string
            link1: string
            link2: string
            link3: string
            createdTime: number
            isGraduated: number
            graduatedAt: number | null
        }>
    }
    tokenSnapshots: {
        items: Array<{
            tokenAddr: string
            lastSwapAt: number
            marketCapNative: string
            athMarketCapNative: string
            lastPrice: string
            price1dAgoTimestamp: number | null
            priceChange1dPct: string | null
        }>
    }
}

interface SnapshotData {
    lastSwapAt: number
    marketCapNative: string
    athMarketCapNative: string
    lastPrice: string
    priceChange1dPct: number | null
}

interface UseTokenListResult {
    tokens: LaunchToken[]
    snapshotMap: Map<string, SnapshotData>
    isLoading: boolean
    refetch: () => void
}

export function useTokenList(): UseTokenListResult {
    const chainId = useChainId()
    const supported = isLaunchpadChain(chainId)

    const {
        data: result,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ['launchpad-token-list', chainId],
        queryFn: async () => {
            const data = await ponderRequest<TokenListResponse>(TOKEN_LIST_QUERY, { chainId })
            const tokens = data.launchTokens.items.map(
                (t): LaunchToken => ({
                    address: t.tokenAddr as Address,
                    name: t.name ?? '',
                    symbol: t.symbol ?? '',
                    logo: t.logo ?? '',
                    description: t.description ?? '',
                    link1: t.link1 ?? '',
                    link2: t.link2 ?? '',
                    link3: t.link3 ?? '',
                    creator: t.creator as Address,
                    createdTime: t.createdTime,
                    chainId,
                    graduatedAt: t.graduatedAt ?? null,
                    isGraduated: t.isGraduated === 1,
                })
            )
            const now = Math.floor(Date.now() / 1000)
            const cutoff = now - 86400
            const snapshotMap = new Map<string, SnapshotData>()
            for (const s of data.tokenSnapshots.items) {
                const changePct = s.priceChange1dPct ? parseFloat(s.priceChange1dPct) : null
                // Hide badge if the reference price timestamp is too far from the 24h mark
                const isStale =
                    s.price1dAgoTimestamp == null ||
                    s.price1dAgoTimestamp < cutoff - STALENESS_TOLERANCE
                snapshotMap.set(s.tokenAddr.toLowerCase(), {
                    lastSwapAt: s.lastSwapAt,
                    marketCapNative: s.marketCapNative,
                    athMarketCapNative: s.athMarketCapNative,
                    lastPrice: s.lastPrice,
                    priceChange1dPct: isStale ? null : changePct,
                })
            }
            return { tokens, snapshotMap }
        },
        staleTime: 30_000,
        enabled: supported,
    })

    if (!supported) {
        return {
            tokens: [],
            snapshotMap: new Map<string, SnapshotData>(),
            isLoading: false,
            refetch: () => {},
        }
    }

    return {
        tokens: result?.tokens ?? [],
        snapshotMap: result?.snapshotMap ?? new Map<string, SnapshotData>(),
        isLoading,
        refetch,
    }
}
