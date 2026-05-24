'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ERC20_ABI } from '@/lib/abis/erc20'
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

    // Phase 1: Fetch graduated tokens from Ponder
    const { data: rawTokens, isLoading: isLoadingTokens } = useQuery({
        queryKey: ['graduated-token-addresses'],
        queryFn: async () => {
            try {
                const data = await ponderRequest<GraduatedTokensResponse>(GRADUATED_TOKENS_QUERY)
                return data.launchTokens.items
                    .filter((t) => t.isGraduated === 1)
                    .map((t) => ({
                        address: t.tokenAddr as Address,
                        name: t.name ?? '',
                        symbol: t.symbol ?? '',
                        logo: t.logo ?? '',
                    }))
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: isLaunchpadChain,
        staleTime: 60_000,
    })

    const tokens = rawTokens ?? []

    // Phase 2: ERC20 enrichment — batch-read name + symbol
    const { data: nameResults, isLoading: isLoadingNames } = useReadContracts({
        contracts: tokens.map((t) => ({
            address: t.address as Address,
            abi: ERC20_ABI,
            functionName: 'name' as const,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        })),
        query: { enabled: tokens.length > 0 && isLaunchpadChain },
    })

    const { data: symbolResults, isLoading: isLoadingSymbols } = useReadContracts({
        contracts: tokens.map((t) => ({
            address: t.address as Address,
            abi: ERC20_ABI,
            functionName: 'symbol' as const,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        })),
        query: { enabled: tokens.length > 0 && isLaunchpadChain },
    })

    const enrichedTokens = useMemo<Token[]>(() => {
        return tokens.map((t, i) => ({
            address: t.address,
            symbol: (symbolResults?.[i]?.result as string | undefined) || t.symbol || '???',
            name: (nameResults?.[i]?.result as string | undefined) || t.name || '',
            decimals: 18,
            chainId: PUMP_CORE_NATIVE_CHAIN_ID,
            logo: t.logo,
        }))
    }, [tokens, symbolResults, nameResults])

    if (!isLaunchpadChain) {
        return { tokens: [], isLoading: false }
    }

    return {
        tokens: enrichedTokens,
        isLoading: isLoadingTokens || isLoadingNames || isLoadingSymbols,
    }
}
