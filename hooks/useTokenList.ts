'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { fetchTokenListRpc } from '@/lib/rpc/launchpad-queries'
import type { LaunchToken } from '@/types/launchpad'

const TOKEN_LIST_QUERY = `
  query TokenList {
    launchTokens(orderBy: "createdTime", orderDirection: "desc") {
      items {
        tokenAddr
        creator
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

export interface SnapshotData {
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
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    const {
        data: result,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ['launchpad-token-list'],
        queryFn: async () => {
            try {
                const data = await ponderRequest<TokenListResponse>(TOKEN_LIST_QUERY)
                const tokens = data.launchTokens.items.map(
                    (t): LaunchToken => ({
                        address: t.tokenAddr as Address,
                        name: '',
                        symbol: '',
                        logo: t.logo ?? '',
                        description: t.description ?? '',
                        link1: t.link1 ?? '',
                        link2: t.link2 ?? '',
                        link3: t.link3 ?? '',
                        creator: t.creator as Address,
                        createdTime: t.createdTime,
                        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
                        graduatedAt: t.graduatedAt ?? null,
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
            } catch (e) {
                if (!isPonderError(e) || !publicClient) throw e
                const tokens = await fetchTokenListRpc(publicClient)
                return { tokens, snapshotMap: new Map<string, SnapshotData>() }
            }
        },
        enabled: !!publicClient,
        staleTime: 30_000,
    })

    return {
        tokens: result?.tokens ?? [],
        snapshotMap: result?.snapshotMap ?? new Map<string, SnapshotData>(),
        isLoading,
        refetch,
    }
}
