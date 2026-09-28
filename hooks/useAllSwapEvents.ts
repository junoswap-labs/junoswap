'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchBondingCurveSwaps, fetchLaunchTokens } from '@coshi190/juno-moneta-sdk'
import { getBondingCurveDeployment } from '@/lib/deployments'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { v3SwapToSwapEvent } from '@/services/launchpad/platform-adapter'
import { ponderClient } from '@/lib/ponder-client'
import { resolveLaunchpadLogo } from '@/lib/logo'
import { applyLaunchpadTokenOverride } from '@/lib/launchpad-token-config'
import { LAUNCH_TOKEN_META_FIELDS } from '@/lib/ponder-fields'
import type { EnrichedSwapEvent } from '@/types/launchpad'

const LIVE_WINDOW_SECONDS = 86400
const V3_LIMIT = 50
const BC_LIMIT = 200

// fetchBondingCurveSwaps only covers bonding-curve swapEvents; graduated tokens trade on their V3 pool,
// so those are queried separately and merged, keeping the ticker in line with the Last Trade sort.
const RECENT_V3_SWAPS_QUERY = `query RecentV3Swaps($chainId: Int!, $tokens: [String!], $since: Int!, $limit: Int!) {
    v3SwapEvents(
        where: { chainId: $chainId, tokenAddr_in: $tokens, timestamp_gte: $since }
        orderBy: "timestamp"
        orderDirection: "desc"
        limit: $limit
    ) { items { tokenAddr txFrom tokenIsToken0 amount0 amount1 timestamp transactionHash blockNumber } }
}`

interface RecentV3SwapRow {
    tokenAddr: string
    txFrom: string
    tokenIsToken0: number
    amount0: string
    amount1: string
    timestamp: number
    transactionHash: string
    blockNumber: string
}

export function useAllSwapEvents() {
    const chainId = useLaunchpadChainId()
    const supported = getBondingCurveDeployment(chainId) !== undefined

    const {
        data: events = [],
        isLoading,
        ...rest
    } = useQuery({
        queryKey: ['all-swap-events', chainId],
        queryFn: async (): Promise<EnrichedSwapEvent[]> => {
            const since = Math.floor(Date.now() / 1000) - LIVE_WINDOW_SECONDS
            const [{ items: swaps }, tokens, graduated] = await Promise.all([
                fetchBondingCurveSwaps(ponderClient, {
                    chainId,
                    page: { limit: BC_LIMIT, offset: 0 },
                }),
                fetchLaunchTokens(ponderClient, { chainId }, LAUNCH_TOKEN_META_FIELDS),
                ponderClient.request<{ launchTokens: { items: { tokenAddr: string }[] } }>(
                    `query GraduatedTokens($chainId: Int!) {
                        launchTokens(where: { chainId: $chainId, isGraduated: 1 }, limit: 1000) {
                            items { tokenAddr }
                        }
                    }`,
                    { chainId }
                ),
            ])
            const graduatedAddrs = graduated.launchTokens.items.map((t: { tokenAddr: string }) =>
                t.tokenAddr.toLowerCase()
            )
            const v3Swaps = graduatedAddrs.length
                ? (
                      await ponderClient.request<{ v3SwapEvents: { items: RecentV3SwapRow[] } }>(
                          RECENT_V3_SWAPS_QUERY,
                          { chainId, tokens: graduatedAddrs, since, limit: V3_LIMIT }
                      )
                  ).v3SwapEvents.items
                : []

            const tokenMeta = new Map<string, { logo: string; name: string; symbol: string }>()
            for (const raw of tokens) {
                const token = applyLaunchpadTokenOverride(raw, chainId)
                tokenMeta.set(token.tokenAddr.toLowerCase(), {
                    logo: resolveLaunchpadLogo(token.logo),
                    name: token.name ?? '',
                    symbol: token.symbol ?? '',
                })
            }
            const enrich = (
                e: Omit<EnrichedSwapEvent, 'tokenSymbol' | 'tokenName' | 'tokenLogo' | 'logIndex'>
            ): EnrichedSwapEvent => {
                const meta = tokenMeta.get(e.tokenAddr.toLowerCase())
                return {
                    ...e,
                    logIndex: 0,
                    tokenSymbol: meta?.symbol || '???',
                    tokenName: meta?.name ?? '',
                    tokenLogo: meta?.logo ?? '',
                }
            }

            const bcEvents = swaps.map((e) =>
                enrich({
                    blockNumber: BigInt(0),
                    timestamp: e.timestamp,
                    sender: e.sender as Address,
                    isBuy: e.isBuy === 1,
                    tokenAddr: e.tokenAddr as Address,
                    amountIn: BigInt(e.amountIn),
                    amountOut: BigInt(e.amountOut),
                    reserveIn: BigInt(e.reserveIn),
                    reserveOut: BigInt(e.reserveOut),
                    transactionHash: e.transactionHash as `0x${string}`,
                })
            )
            const v3Events = v3Swaps.map((e) =>
                enrich(v3SwapToSwapEvent(e, e.tokenAddr as Address))
            )

            return [...bcEvents, ...v3Events]
                .filter((e) => e.timestamp >= since)
                .sort((a, b) => b.timestamp - a.timestamp)
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
