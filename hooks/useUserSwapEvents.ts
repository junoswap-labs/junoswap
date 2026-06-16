'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { isLeaderboardSupportedChain } from '@/lib/leaderboard-utils'
import { isLaunchpadChain } from '@/lib/abis/pump-core-native'

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
            tokenIsToken0: number
            amount0: string
            amount1: string
            timestamp: number
        }>
    }
}

const PAGE_SIZE = 500

const V3_SWAP_EVENTS_QUERY = `
  query V3SwapEventsPage($sender: String!, $chainId: Int!, $after: String) {
    v3SwapEvents(
      where: { txFrom: $sender, chainId: $chainId },
      orderBy: "timestamp",
      orderDirection: "asc",
      limit: ${PAGE_SIZE},
      after: $after
    ) {
      items {
        id
        tokenAddr
        tokenIsToken0
        amount0
        amount1
        timestamp
      }
    }
  }
`

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

async function fetchAllV3SwapEvents(sender: string, chainId: number): Promise<UserSwapEvent[]> {
    const events: UserSwapEvent[] = []
    let after: string | undefined

    for (;;) {
        const data = await ponderRequest<V3SwapEventsPage>(V3_SWAP_EVENTS_QUERY, {
            sender,
            chainId,
            after,
        })
        const items = data.v3SwapEvents.items
        for (const e of items) {
            // amount0/amount1 are pool-perspective deltas: positive = token into the
            // pool (user pays), negative = out of the pool (user receives). Use
            // tokenIsToken0 to pick which side is the token vs native — the launch
            // token can sort to either side of WKUB.
            const tokenIsToken0 = e.tokenIsToken0 === 1
            const tokenAmt = BigInt(tokenIsToken0 ? e.amount0 : e.amount1)
            const nativeAmt = BigInt(tokenIsToken0 ? e.amount1 : e.amount0)
            const abs = (x: bigint) => (x < 0n ? -x : x)
            const isBuy = tokenAmt < 0n // token leaves the pool => user receives it
            events.push({
                tokenAddr: e.tokenAddr.toLowerCase(),
                isBuy,
                amountIn: (isBuy ? abs(nativeAmt) : abs(tokenAmt)).toString(),
                amountOut: (isBuy ? abs(tokenAmt) : abs(nativeAmt)).toString(),
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
    const isSupportedChain = isLeaderboardSupportedChain(chainId)
    const hasLaunchpad = isLaunchpadChain(chainId)

    return useQuery({
        queryKey: ['user-swap-events', address, chainId],
        queryFn: async (): Promise<UserSwapEvent[]> => {
            if (!address || !isSupportedChain) return []
            try {
                const [bondingCurveEvents, v3Events] = await Promise.all([
                    hasLaunchpad ? fetchAllSwapEvents(address.toLowerCase()) : Promise.resolve([]),
                    fetchAllV3SwapEvents(address.toLowerCase(), chainId),
                ])
                return [...bondingCurveEvents, ...v3Events].sort(
                    (a, b) => a.timestamp - b.timestamp
                )
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: !!address && isSupportedChain,
        staleTime: 60_000,
    })
}
