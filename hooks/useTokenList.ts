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
        }>
    }
}

interface UseTokenListResult {
    tokens: LaunchToken[]
    isLoading: boolean
    refetch: () => void
}

export function useTokenList(): UseTokenListResult {
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    const {
        data: tokens = [],
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ['launchpad-token-list'],
        queryFn: async () => {
            try {
                const data = await ponderRequest<TokenListResponse>(TOKEN_LIST_QUERY)
                return data.launchTokens.items.map(
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
                    })
                )
            } catch (e) {
                if (!isPonderError(e) || !publicClient) throw e
                return fetchTokenListRpc(publicClient)
            }
        },
        enabled: !!publicClient,
        staleTime: 30_000,
    })

    return { tokens, isLoading, refetch }
}
