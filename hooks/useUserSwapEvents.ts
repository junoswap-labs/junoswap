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

interface SwapEventsPage {
    swapEvents: {
        items: Array<{
            id: string
            tokenAddr: string
            isBuy: number
            amountIn: string
            amountOut: string
            timestamp: number
        }>
    }
}

interface V3SwapEventsPage {
    v3SwapEvents: {
        items: Array<{
            id: string
            tokenAddr: string
            amount0: string
            amount1: string
            timestamp: number
        }>
    }
}

const PAGE_SIZE = 500

async function fetchAllSwapEvents(sender: string): Promise<UserSwapEvent[]> {
    const events: UserSwapEvent[] = []
    let after: string | undefined

    for (;;) {
        const query = `
          query SwapEventsPage($sender: String!, $after: String) {
            swapEvents(
              where: { sender: $sender },
              orderBy: "timestamp",
              orderDirection: "asc",
              limit: ${PAGE_SIZE},
              after: $after
            ) {
              items {
                id
                tokenAddr
                isBuy
                amountIn
                amountOut
                timestamp
              }
            }
          }
        `
        const data = await ponderRequest<SwapEventsPage>(query, { sender, after })
        const items = data.swapEvents.items
        for (const e of items) {
            events.push({
                tokenAddr: e.tokenAddr.toLowerCase(),
                isBuy: e.isBuy === 1,
                amountIn: e.amountIn,
                amountOut: e.amountOut,
                timestamp: e.timestamp,
            })
        }
        if (items.length < PAGE_SIZE) break
        const last = items[items.length - 1]
        if (!last) break
        after = last.id
    }

    return events
}

async function fetchAllV3SwapEvents(sender: string): Promise<UserSwapEvent[]> {
    const events: UserSwapEvent[] = []
    let after: string | undefined

    for (;;) {
        const query = `
          query V3SwapEventsPage($sender: String!, $after: String) {
            v3SwapEvents(
              where: { recipient: $sender },
              orderBy: "timestamp",
              orderDirection: "asc",
              limit: ${PAGE_SIZE},
              after: $after
            ) {
              items {
                id
                tokenAddr
                amount0
                amount1
                timestamp
              }
            }
          }
        `
        const data = await ponderRequest<V3SwapEventsPage>(query, { sender, after })
        const items = data.v3SwapEvents.items
        for (const e of items) {
            const amount0 = BigInt(e.amount0)
            const amount1 = BigInt(e.amount1)
            const isBuy = amount0 < 0n
            events.push({
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
            })
        }
        if (items.length < PAGE_SIZE) break
        const last = items[items.length - 1]
        if (!last) break
        after = last.id
    }

    return events
}

export function useUserSwapEvents(address: Address | undefined, chainId: number) {
    const isLaunchpadChain = chainId === PUMP_CORE_NATIVE_CHAIN_ID

    return useQuery({
        queryKey: ['user-swap-events', address, chainId],
        queryFn: async (): Promise<UserSwapEvent[]> => {
            if (!address || !isLaunchpadChain) return []
            try {
                const [bondingCurveEvents, v3Events] = await Promise.all([
                    fetchAllSwapEvents(address.toLowerCase()),
                    fetchAllV3SwapEvents(address.toLowerCase()),
                ])
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
