'use client'

import { useQuery } from '@tanstack/react-query'
import { useChainId } from 'wagmi'
import type { Address } from 'viem'
import { isLaunchpadChain } from '@/lib/abis/bonding-curve-junoswap'
import { ponderRequest } from '@/lib/ponder-client'
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
    const chainId = useChainId()
    const supported = isLaunchpadChain(chainId)

    const {
        data: events = [],
        isLoading,
        ...rest
    } = useQuery({
        queryKey: ['all-swap-events', chainId],
        queryFn: async (): Promise<EnrichedSwapEvent[]> => {
            const data = await ponderRequest<SwapEventsResponse>(ALL_SWAP_EVENTS_QUERY)

            const tokenMeta = new Map<string, { logo: string; name: string; symbol: string }>()
            for (const token of data.launchTokens.items) {
                tokenMeta.set(token.tokenAddr.toLowerCase(), {
                    logo: token.logo ?? '',
                    name: token.name ?? '',
                    symbol: token.symbol ?? '',
                })
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
        },
        staleTime: 15_000,
        refetchInterval: supported ? 15_000 : false,
        enabled: supported,
    })

    if (!supported) {
        return { data: [], isLoading: false }
    }

    return { data: events, isLoading, ...rest }
}
