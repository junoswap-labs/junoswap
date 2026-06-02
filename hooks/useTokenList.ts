'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ponderRequest } from '@/lib/ponder-client'
import type { LaunchToken } from '@/types/launchpad'

const TOKEN_LIST_QUERY = `
  query TokenList {
    launchTokens(orderBy: "createdTime", orderDirection: "desc") {
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
    tokenSnapshots {
      items {
        tokenAddr
        lastSwapAt
        marketCapNative
        athMarketCapNative
      }
    }
  }
`

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
        }>
    }
}

interface SnapshotData {
    lastSwapAt: number
    marketCapNative: string
    athMarketCapNative: string
}

interface UseTokenListResult {
    tokens: LaunchToken[]
    snapshotMap: Map<string, SnapshotData>
    isLoading: boolean
    refetch: () => void
}

export function useTokenList(): UseTokenListResult {
    const {
        data: result,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ['launchpad-token-list'],
        queryFn: async () => {
            const data = await ponderRequest<TokenListResponse>(TOKEN_LIST_QUERY)
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
                    chainId: PUMP_CORE_NATIVE_CHAIN_ID,
                    graduatedAt: t.graduatedAt ?? null,
                    isGraduated: t.isGraduated === 1,
                })
            )
            const snapshotMap = new Map<string, SnapshotData>()
            for (const s of data.tokenSnapshots.items) {
                snapshotMap.set(s.tokenAddr.toLowerCase(), {
                    lastSwapAt: s.lastSwapAt,
                    marketCapNative: s.marketCapNative,
                    athMarketCapNative: s.athMarketCapNative,
                })
            }
            return { tokens, snapshotMap }
        },
        staleTime: 30_000,
    })

    return {
        tokens: result?.tokens ?? [],
        snapshotMap: result?.snapshotMap ?? new Map<string, SnapshotData>(),
        isLoading,
        refetch,
    }
}
