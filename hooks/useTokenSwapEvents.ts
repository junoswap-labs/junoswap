'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { fetchTokenSwapEventsRpc, type SwapEventData } from '@/lib/rpc/launchpad-queries'

export type { SwapEventData }

const TOKEN_SWAP_EVENTS_QUERY = `
  query TokenSwapEvents($tokenAddr: String!) {
    swapEvents(where: { tokenAddr: $tokenAddr }, orderBy: "timestamp", orderDirection: "desc") {
      items {
        sender
        isBuy
        amountIn
        amountOut
        reserveIn
        reserveOut
        timestamp
        transactionHash
        blockNumber
      }
    }
  }
`

interface TokenSwapEventsResponse {
    swapEvents: {
        items: Array<{
            sender: string
            isBuy: number
            amountIn: string
            amountOut: string
            reserveIn: string
            reserveOut: string
            timestamp: number
            transactionHash: string
            blockNumber: number
        }>
    }
}

export function useTokenSwapEvents(tokenAddr: Address | undefined) {
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    return useQuery({
        queryKey: ['token-swap-events', tokenAddr?.toLowerCase()],
        queryFn: async (): Promise<SwapEventData[]> => {
            if (!tokenAddr) return []

            try {
                const data = await ponderRequest<TokenSwapEventsResponse>(TOKEN_SWAP_EVENTS_QUERY, {
                    tokenAddr: tokenAddr.toLowerCase(),
                })

                return data.swapEvents.items.map((e) => ({
                    blockNumber: BigInt(e.blockNumber),
                    timestamp: e.timestamp,
                    sender: e.sender as Address,
                    isBuy: e.isBuy === 1,
                    tokenAddr: tokenAddr,
                    amountIn: BigInt(e.amountIn),
                    amountOut: BigInt(e.amountOut),
                    reserveIn: BigInt(e.reserveIn),
                    reserveOut: BigInt(e.reserveOut),
                    transactionHash: e.transactionHash as `0x${string}`,
                }))
            } catch (e) {
                if (!isPonderError(e) || !publicClient) throw e
                return fetchTokenSwapEventsRpc(publicClient, tokenAddr)
            }
        },
        enabled: !!tokenAddr && !!publicClient,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })
}
