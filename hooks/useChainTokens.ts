'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getTokensForChain } from '@/lib/tokens'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import type { Token } from '@/types/tokens'

interface V3TokenResponse {
    v3Tokens: {
        items: Array<{
            id: string
            chainId: number
            address: string
            symbol: string
            name: string
            decimals: number
        }>
    }
}

const V3_TOKENS_QUERY = `
  query V3Tokens($chainId: Int!) {
    v3Tokens(where: { chainId: $chainId }, limit: 500) {
      items {
        id
        chainId
        address
        symbol
        name
        decimals
      }
    }
  }
`

export function useChainTokens(chainId: number): { tokens: Token[]; isLoading: boolean } {
    const staticTokens = useMemo(() => getTokensForChain(chainId), [chainId])
    const { tokens: graduatedTokens } = useGraduatedTokens(chainId)

    const { data: v3Tokens, isLoading: isLoadingV3 } = useQuery({
        queryKey: ['v3-tokens', chainId],
        queryFn: async () => {
            try {
                const data = await ponderRequest<V3TokenResponse>(V3_TOKENS_QUERY, { chainId })
                return data.v3Tokens.items
                    .filter((t) => t.symbol || t.name)
                    .map(
                        (t): Token => ({
                            address: t.address as Address,
                            symbol: t.symbol || '???',
                            name: t.name || '',
                            decimals: t.decimals || 18,
                            chainId,
                        })
                    )
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        staleTime: 60_000,
    })

    const tokens = useMemo(() => {
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

        return merged
    }, [staticTokens, graduatedTokens, v3Tokens])

    return { tokens, isLoading: isLoadingV3 }
}
