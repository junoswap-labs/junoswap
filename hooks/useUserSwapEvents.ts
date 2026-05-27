'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'

export interface UserSwapEvent {
    tokenAddr: string
    isBuy: boolean
    amountIn: string
    amountOut: string
    timestamp: number
}

interface UserSwapEventsResponse {
    swapEvents: {
        items: Array<{
            tokenAddr: string
            isBuy: number
            amountIn: string
            amountOut: string
            timestamp: number
        }>
    }
    v3SwapEvents: {
        items: Array<{
            tokenAddr: string
            amount0: string
            amount1: string
            timestamp: number
        }>
    }
}

const USER_SWAP_EVENTS_QUERY = `
  query UserSwapEvents($sender: String!) {
    swapEvents(where: { sender: $sender }, orderBy: "timestamp", orderDirection: "asc", limit: 500) {
      items {
        tokenAddr
        isBuy
        amountIn
        amountOut
        timestamp
      }
    }
    v3SwapEvents(where: { recipient: $sender }, orderBy: "timestamp", orderDirection: "asc", limit: 500) {
      items {
        tokenAddr
        amount0
        amount1
        timestamp
      }
    }
  }
`

export function useUserSwapEvents(address: Address | undefined, chainId: number) {
    const isLaunchpadChain = chainId === PUMP_CORE_NATIVE_CHAIN_ID

    return useQuery({
        queryKey: ['user-swap-events', address, chainId],
        queryFn: async (): Promise<UserSwapEvent[]> => {
            if (!address || !isLaunchpadChain) return []
            try {
                const data = await ponderRequest<UserSwapEventsResponse>(USER_SWAP_EVENTS_QUERY, {
                    sender: address.toLowerCase(),
                })

                const bondingCurveEvents: UserSwapEvent[] = data.swapEvents.items.map((e) => ({
                    tokenAddr: e.tokenAddr.toLowerCase(),
                    isBuy: e.isBuy === 1,
                    amountIn: e.amountIn,
                    amountOut: e.amountOut,
                    timestamp: e.timestamp,
                }))

                const v3Events: UserSwapEvent[] = data.v3SwapEvents.items.map((e) => {
                    const amount0 = BigInt(e.amount0)
                    const amount1 = BigInt(e.amount1)
                    const isBuy = amount0 < 0n
                    return {
                        tokenAddr: e.tokenAddr.toLowerCase(),
                        isBuy,
                        amountIn: isBuy
                            ? amount1 < 0n
                                ? (-amount1).toString()
                                : '0'
                            : (-amount0).toString(),
                        amountOut: isBuy
                            ? amount0 < 0n
                                ? '0'
                                : amount0.toString()
                            : amount1 < 0n
                              ? '0'
                              : amount1.toString(),
                        timestamp: e.timestamp,
                    }
                })

                return [...bondingCurveEvents, ...v3Events].sort(
                    (a, b) => a.timestamp - b.timestamp
                )
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: !!address && isLaunchpadChain,
        staleTime: 60_000,
    })
}
