'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { fetchAllSwapEventsRpc, fetchTokenListRpc } from '@/lib/rpc/launchpad-queries'
import type { EnrichedSwapEvent } from '@/types/launchpad'

const ALL_SWAP_EVENTS_QUERY = `
  query AllSwapEvents {
    swapEvents(orderBy: "timestamp", orderDirection: "desc", limit: 50) {
      items {
        tokenAddr
        sender
        isBuy
        amountIn
        amountOut
        reserveIn
        reserveOut
        timestamp
        transactionHash
      }
    }
    launchTokens {
      items {
        tokenAddr
        logo
        name
        symbol
      }
    }
  }
`

interface SwapEventsResponse {
    swapEvents: {
        items: Array<{
            tokenAddr: string
            sender: string
            isBuy: number
            amountIn: string
            amountOut: string
            reserveIn: string
            reserveOut: string
            timestamp: number
            transactionHash: string
        }>
    }
    launchTokens: {
        items: Array<{
            tokenAddr: string
            logo: string
            name: string
            symbol: string
        }>
    }
}

export function useAllSwapEvents() {
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    const {
        data: events = [],
        isLoading,
        ...rest
    } = useQuery({
        queryKey: ['all-swap-events'],
        queryFn: async (): Promise<EnrichedSwapEvent[]> => {
            try {
                const data = await ponderRequest<SwapEventsResponse>(ALL_SWAP_EVENTS_QUERY)

                const tokenMeta = new Map<string, { logo: string; name: string; symbol: string }>()
                for (const token of data.launchTokens.items) {
                    tokenMeta.set(token.tokenAddr.toLowerCase(), {
                        logo: token.logo ?? '',
                        name: token.name ?? '',
                        symbol: token.symbol ?? '',
                    })
                }

                // Fetch missing symbols on-chain
                if (publicClient) {
                    const missing = [...tokenMeta.entries()].filter(([, m]) => !m.symbol)
                    if (missing.length > 0) {
                        const results = await Promise.allSettled(
                            missing.map(([addr]) =>
                                publicClient.readContract({
                                    address: addr as Address,
                                    abi: ERC20_ABI,
                                    functionName: 'symbol',
                                })
                            )
                        )
                        results.forEach((r, i) => {
                            if (r.status === 'fulfilled') {
                                const entry = missing[i]
                                if (!entry) return
                                const meta = tokenMeta.get(entry[0])!
                                meta.symbol = r.value as string
                            }
                        })
                    }
                }

                return data.swapEvents.items.map((e): EnrichedSwapEvent => {
                    const meta = tokenMeta.get(e.tokenAddr.toLowerCase())
                    return {
                        blockNumber: BigInt(0),
                        logIndex: 0,
                        timestamp: e.timestamp,
                        sender: e.sender as Address,
                        isBuy: e.isBuy === 1,
                        tokenAddr: e.tokenAddr as Address,
                        amountIn: BigInt(e.amountIn),
                        amountOut: BigInt(e.amountOut),
                        reserveIn: BigInt(e.reserveIn),
                        reserveOut: BigInt(e.reserveOut),
                        transactionHash: e.transactionHash as `0x${string}`,
                        tokenSymbol: meta?.symbol || '???',
                        tokenName: meta?.name ?? '',
                        tokenLogo: meta?.logo ?? '',
                    }
                })
            } catch (e) {
                if (!isPonderError(e) || !publicClient) throw e
                const tokenList = await fetchTokenListRpc(publicClient)
                return fetchAllSwapEventsRpc(publicClient, tokenList)
            }
        },
        enabled: !!publicClient,
        staleTime: 15_000,
        refetchInterval: 15_000,
    })

    return { data: events, isLoading, ...rest }
}
