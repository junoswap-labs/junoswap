'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import type { Token } from '@/types/tokens'

const GRADUATED_TOKENS_QUERY = `
  query GraduatedTokens {
    launchTokens(orderBy: "graduatedAt", orderDirection: "desc") {
      items {
        tokenAddr
        name
        symbol
        logo
        isGraduated
      }
    }
  }
`

interface GraduatedTokensResponse {
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

export function useGraduatedTokens(chainId: number): { tokens: Token[]; isLoading: boolean } {
    const isLaunchpadChain = chainId === PUMP_CORE_NATIVE_CHAIN_ID

    const { data: tokens, isLoading } = useQuery({
        queryKey: ['graduated-tokens'],
        queryFn: async () => {
            try {
                const data = await ponderRequest<GraduatedTokensResponse>(GRADUATED_TOKENS_QUERY)
                return data.launchTokens.items
                    .filter((t) => t.isGraduated === 1)
                    .map(
                        (t): Token => ({
                            address: t.tokenAddr as Address,
                            symbol: t.symbol || '???',
                            name: t.name || '',
                            decimals: 18,
                            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
                            logo: t.logo ?? '',
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

    if (!isLaunchpadChain) {
        return { tokens: [], isLoading: false }
    }

    return { tokens: tokens ?? [], isLoading }
}
