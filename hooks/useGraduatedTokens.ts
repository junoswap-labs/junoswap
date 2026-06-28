'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { isLaunchpadChain } from '@/lib/abis/bonding-curve-junoswap'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import type { Token } from '@/types/tokens'

const GRADUATED_TOKENS_QUERY = `
  query GraduatedTokens($chainId: Int!) {
    launchTokens(where: { chainId: $chainId }, orderBy: "graduatedAt", orderDirection: "desc") {
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
    const launchpadChain = isLaunchpadChain(chainId)

    const { data: tokens, isLoading } = useQuery({
        queryKey: ['graduated-tokens', chainId],
        queryFn: async () => {
            try {
                const data = await ponderRequest<GraduatedTokensResponse>(GRADUATED_TOKENS_QUERY, {
                    chainId,
                })
                return data.launchTokens.items
                    .filter((t) => t.isGraduated === 1)
                    .map(
                        (t): Token => ({
                            address: t.tokenAddr as Address,
                            symbol: t.symbol || '???',
                            name: t.name || '',
                            decimals: 18,
                            chainId,
                            logo: t.logo ?? '',
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
        return { tokens: [], isLoading: false }
    }

    return { tokens: tokens ?? [], isLoading }
}
