'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ponderRequest } from '@/lib/ponder-client'
import { BONDING_CURVE_JUNOSWAP_CHAIN_ID } from '@/lib/abis/bonding-curve-junoswap'
import type { SwapEventData } from '@/lib/rpc/launchpad-queries'

export type { SwapEventData }

interface SwapEventFilters {
    isBuy?: boolean // true = buys only, false = sells only, undefined = all
    sender?: string // lowercase hex address to filter by
}

function buildBondingCurveQuery(hasIsBuy: boolean, hasSender: boolean) {
    const whereParts = ['tokenAddr: $tokenAddr']
    if (hasIsBuy) whereParts.push('isBuy: $isBuy')
    if (hasSender) whereParts.push('sender: $sender')
    const where = whereParts.join(', ')

    const varParts = ['$tokenAddr: String!', '$limit: Int!', '$offset: Int!']
    if (hasIsBuy) varParts.push('$isBuy: Int!')
    if (hasSender) varParts.push('$sender: String!')

    return `
      query TokenSwapEvents(${varParts.join(', ')}) {
        swapEvents(
          where: { ${where} },
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
}

const V3_SWAP_EVENTS_QUERY = `
  query V3SwapEvents($tokenAddr: String!, $limit: Int!, $offset: Int!, $txFrom: String, $chainId: Int!) {
    v3SwapEvents(
      where: { tokenAddr: $tokenAddr, txFrom: $txFrom, chainId: $chainId },
      orderBy: "timestamp",
      orderDirection: "desc",
      limit: $limit,
      offset: $offset
    ) {
      items {
        txFrom
        tokenIsToken0
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
            txFrom: string
            tokenIsToken0: number
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
    isGraduated?: boolean,
    filters?: SwapEventFilters
) {
    return useQuery({
        queryKey: [
            'token-swap-events',
            tokenAddr?.toLowerCase(),
            page,
            pageSize,
            poolAddress?.toLowerCase(),
            isGraduated,
            filters?.isBuy,
            filters?.sender?.toLowerCase(),
        ],
        queryFn: async (): Promise<{ data: SwapEventData[]; totalCount: number }> => {
            if (!tokenAddr) return { data: [], totalCount: 0 }

            const offset = (page - 1) * pageSize
            const fetchLimit = pageSize + 1

            // For graduated tokens, merge V3 + bonding curve events
            if (isGraduated) {
                // Bonding curve events (historical, finite)
                const hasBcIsBuy = filters?.isBuy !== undefined
                const hasBcSender = !!filters?.sender
                const bcQuery = buildBondingCurveQuery(hasBcIsBuy, hasBcSender)
                const bcVariables: Record<string, unknown> = {
                    tokenAddr: tokenAddr.toLowerCase(),
                    limit: 1000, // BC events are finite after graduation
                    offset: 0,
                }
                if (hasBcIsBuy) bcVariables.isBuy = filters!.isBuy! ? 1 : 0
                if (hasBcSender) bcVariables.sender = filters!.sender!.toLowerCase()

                // V3 events (server-side pagination, txFrom filter)
                const v3Variables: Record<string, unknown> = {
                    tokenAddr: tokenAddr.toLowerCase(),
                    limit: fetchLimit,
                    offset,
                    chainId: BONDING_CURVE_JUNOSWAP_CHAIN_ID,
                }
                if (filters?.sender) {
                    v3Variables.txFrom = filters.sender.toLowerCase()
                }

                // Fetch both in parallel
                const [bcResult, v3Result] = await Promise.all([
                    ponderRequest<BondingCurveSwapEventsResponse>(bcQuery, bcVariables),
                    ponderRequest<V3SwapEventsResponse>(V3_SWAP_EVENTS_QUERY, v3Variables),
                ])

                // Normalize bonding curve events
                const bcItems = bcResult.swapEvents.items.map((e) => ({
                    blockNumber: BigInt(e.blockNumber),
                    timestamp: e.timestamp,
                    sender: e.sender as Address,
                    isBuy: e.isBuy === 1,
                    tokenAddr,
                    amountIn: BigInt(e.amountIn),
                    amountOut: BigInt(e.amountOut),
                    reserveIn: BigInt(e.reserveIn),
                    reserveOut: BigInt(e.reserveOut),
                    transactionHash: e.transactionHash as `0x${string}`,
                }))

                // Normalize V3 events
                let v3Items = v3Result.v3SwapEvents.items.map((e) => {
                    const amount0 = BigInt(e.amount0)
                    const amount1 = BigInt(e.amount1)

                    // Launch token can be token0 or token1; tokenIsToken0 disambiguates.
                    const tokenIsToken0 = e.tokenIsToken0 === 1
                    const tokenAmount = tokenIsToken0 ? amount0 : amount1
                    const nativeAmount = tokenIsToken0 ? amount1 : amount0

                    // V3 amounts are signed from the pool's view: negative = pool paid
                    // out to user. User receives the token on a buy.
                    const isBuy = tokenAmount < 0n

                    return {
                        blockNumber: BigInt(e.blockNumber),
                        timestamp: e.timestamp,
                        sender: e.txFrom as Address, // actual signer, not the router
                        isBuy,
                        tokenAddr,
                        amountIn: absBigInt(isBuy ? nativeAmount : tokenAmount),
                        amountOut: absBigInt(isBuy ? tokenAmount : nativeAmount),
                        reserveIn: 0n,
                        reserveOut: 0n,
                        transactionHash: e.transactionHash as `0x${string}`,
                    }
                })

                // V3 isBuy is computed client-side, filter here if needed
                if (filters?.isBuy !== undefined) {
                    v3Items = v3Items.filter((item) => item.isBuy === filters.isBuy)
                }

                // Merge: V3 events (newer) first, then BC events (older).
                // All V3 timestamps >= graduatedAt and all BC timestamps < graduatedAt,
                // so both desc-sorted sets concatenate cleanly.
                const merged = [...v3Items, ...bcItems]

                const hasMore = merged.length > pageSize
                const data = hasMore ? merged.slice(0, pageSize) : merged
                const totalCount = merged.length + offset

                return { data, totalCount }
            }

            // Non-graduated: bonding curve events from Ponder
            const hasIsBuy = filters?.isBuy !== undefined
            const hasSender = !!filters?.sender
            const query = buildBondingCurveQuery(hasIsBuy, hasSender)

            const variables: Record<string, unknown> = {
                tokenAddr: tokenAddr.toLowerCase(),
                limit: fetchLimit,
                offset,
            }
            if (hasIsBuy) variables.isBuy = filters!.isBuy! ? 1 : 0
            if (hasSender) variables.sender = filters!.sender!.toLowerCase()

            const result = await ponderRequest<BondingCurveSwapEventsResponse>(query, variables)

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
