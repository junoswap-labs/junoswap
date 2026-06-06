'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ponderRequest } from '@/lib/ponder-client'
import type { SwapEventData } from '@/lib/rpc/launchpad-queries'

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
  }
`

const V3_SWAP_EVENTS_QUERY = `
  query V3SwapEvents($tokenAddr: String!, $limit: Int!, $offset: Int!) {
    v3SwapEvents(
      where: { tokenAddr: $tokenAddr },
      orderBy: "timestamp",
      orderDirection: "desc",
      limit: $limit,
      offset: $offset
    ) {
      items {
        sender
        recipient
        amount0
        amount1
        sqrtPriceX96
        timestamp
        transactionHash
        blockNumber
      }
    }
  }
`

interface BondingCurveSwapEventsResponse {
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

interface V3SwapEventsResponse {
    v3SwapEvents: {
        items: Array<{
            sender: string
            recipient: string
            amount0: string
            amount1: string
            sqrtPriceX96: string
            timestamp: number
            transactionHash: string
            blockNumber: number
        }>
    }
}

function absBigInt(n: bigint): bigint {
    return n < 0n ? -n : n
}

export function useTokenSwapEvents(
    tokenAddr: Address | undefined,
    page: number = 1,
    pageSize: number = 10,
    poolAddress?: Address,
    isGraduated?: boolean
) {
    return useQuery({
        queryKey: [
            'token-swap-events',
            tokenAddr?.toLowerCase(),
            page,
            pageSize,
            poolAddress?.toLowerCase(),
            isGraduated,
        ],
        queryFn: async (): Promise<{ data: SwapEventData[]; totalCount: number }> => {
            if (!tokenAddr) return { data: [], totalCount: 0 }

            const offset = (page - 1) * pageSize

            // Fetch pageSize + 1 to detect whether there are more pages,
            // then trim to pageSize for display. This avoids using
            // tokenSnapshot.totalBuys/totalSells which inflates the count
            // for graduated tokens (it includes both bonding curve AND V3 trades).
            const fetchLimit = pageSize + 1

            // For graduated tokens, query V3 swap events from Ponder
            if (isGraduated) {
                const result = await ponderRequest<V3SwapEventsResponse>(V3_SWAP_EVENTS_QUERY, {
                    tokenAddr: tokenAddr.toLowerCase(),
                    limit: fetchLimit,
                    offset,
                })

                const allItems = result.v3SwapEvents.items.map((e) => {
                    const amount0 = BigInt(e.amount0)
                    const amount1 = BigInt(e.amount1)

                    // In V3, the token side has negative amount on buy
                    // amount0/amount1 ordering depends on token0/token1,
                    // but the sign convention is consistent: the token being bought has negative amount
                    const isBuy = amount0 < 0n
                    const tokenAmount = isBuy ? amount0 : amount1
                    const nativeAmount = isBuy ? amount1 : amount0

                    return {
                        blockNumber: BigInt(e.blockNumber),
                        timestamp: e.timestamp,
                        sender: (e.recipient ?? e.sender) as Address,
                        isBuy,
                        tokenAddr,
                        amountIn: absBigInt(isBuy ? nativeAmount : tokenAmount),
                        amountOut: absBigInt(isBuy ? tokenAmount : nativeAmount),
                        reserveIn: 0n,
                        reserveOut: 0n,
                        transactionHash: e.transactionHash as `0x${string}`,
                    }
                })

                const hasMore = allItems.length > pageSize
                const data = hasMore ? allItems.slice(0, pageSize) : allItems
                const totalCount = allItems.length + offset

                return { data, totalCount }
            }

            // Non-graduated: bonding curve events from Ponder
            const result = await ponderRequest<BondingCurveSwapEventsResponse>(
                TOKEN_SWAP_EVENTS_QUERY,
                {
                    tokenAddr: tokenAddr.toLowerCase(),
                    limit: fetchLimit,
                    offset,
                }
            )

            const allItems = result.swapEvents.items.map((e) => ({
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

            const hasMore = allItems.length > pageSize
            const data = hasMore ? allItems.slice(0, pageSize) : allItems
            const totalCount = allItems.length + offset

            return { data, totalCount }
        },
        enabled: !!tokenAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })
}
