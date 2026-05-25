'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { fetchTokenSwapEventsRpc, type SwapEventData } from '@/lib/rpc/launchpad-queries'

export type { SwapEventData }

const TOKEN_SWAP_EVENTS_QUERY = `
  query TokenSwapEvents($tokenAddr: String!, $limit: Int!, $offset: Int!) {
    swapEvents(
      where: { tokenAddr: $tokenAddr },
      orderBy: "timestamp",
      orderDirection: "desc",
      limit: $limit,
      offset: $offset
    ) {
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
    tokenSnapshots(where: { tokenAddr: $tokenAddr }) {
      items {
        totalBuys
        totalSells
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
    tokenSnapshots: {
        items: Array<{
            totalBuys: number
            totalSells: number
        }>
    }
}

export function useTokenSwapEvents(
    tokenAddr: Address | undefined,
    page: number = 1,
    pageSize: number = 10
) {
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    return useQuery({
        queryKey: ['token-swap-events', tokenAddr?.toLowerCase(), page, pageSize],
        queryFn: async (): Promise<{ data: SwapEventData[]; totalCount: number }> => {
            if (!tokenAddr) return { data: [], totalCount: 0 }

            const offset = (page - 1) * pageSize

            try {
                const result = await ponderRequest<TokenSwapEventsResponse>(
                    TOKEN_SWAP_EVENTS_QUERY,
                    {
                        tokenAddr: tokenAddr.toLowerCase(),
                        limit: pageSize,
                        offset,
                    }
                )

                const data = result.swapEvents.items.map((e) => ({
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

                const snapshot = result.tokenSnapshots.items[0]
                const totalCount = snapshot
                    ? snapshot.totalBuys + snapshot.totalSells
                    : data.length + offset

                return { data, totalCount }
            } catch (e) {
                if (!isPonderError(e) || !publicClient) throw e
                const allEvents = await fetchTokenSwapEventsRpc(publicClient, tokenAddr)
                return {
                    data: allEvents.slice(offset, offset + pageSize),
                    totalCount: allEvents.length,
                }
            }
        },
        enabled: !!tokenAddr && !!publicClient,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })
}
