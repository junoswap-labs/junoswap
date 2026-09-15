'use client'

import { useQuery } from '@tanstack/react-query'
import { useChainId } from 'wagmi'
import type { Address } from 'viem'
import { fetchRecentSwaps } from '@coshi190/juno-moneta-sdk'
import { getBondingCurveDeployment } from '@/lib/deployments'
import { ponderClient } from '@/lib/ponder-client'
import { resolveLaunchpadLogo } from '@/lib/logo'
import { applyLaunchpadTokenOverride } from '@/lib/launchpad-token-config'
import type { EnrichedSwapEvent } from '@/types/launchpad'

export function useAllSwapEvents() {
    const chainId = useChainId()
    const supported = getBondingCurveDeployment(chainId) !== undefined

    const {
        data: events = [],
        isLoading,
        ...rest
    } = useQuery({
        queryKey: ['all-swap-events', chainId],
        queryFn: async (): Promise<EnrichedSwapEvent[]> => {
            const { swaps, tokens } = await fetchRecentSwaps(ponderClient, { chainId })

            const tokenMeta = new Map<string, { logo: string; name: string; symbol: string }>()
            for (const raw of tokens) {
                const token = applyLaunchpadTokenOverride(raw, chainId)
                tokenMeta.set(token.tokenAddr.toLowerCase(), {
                    logo: resolveLaunchpadLogo(token.logo),
                    name: token.name ?? '',
                    symbol: token.symbol ?? '',
                })
            }

            return swaps.map((e): EnrichedSwapEvent => {
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
