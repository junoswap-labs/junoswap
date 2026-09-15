'use client'

import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { type Address } from 'viem'
import { getAggregatePlan } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { RouteQuote } from '@/types/routing'
import { getIntermediaryTokens, MIN_AGG_IMPROVEMENT_BPS } from '@/lib/routing-config'

interface UseAggregatePlanParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    allRoutes: RouteQuote[]
    enabled?: boolean
}

export function useAggregatePlan({
    tokenIn,
    tokenOut,
    amountIn,
    allRoutes,
    enabled = true,
}: UseAggregatePlanParams) {
    const chainId = tokenIn?.chainId ?? 0
    const client = usePublicClient({ chainId })

    const isReady = enabled && !!client && !!tokenIn && !!tokenOut && amountIn > 0n

    const query = useQuery({
        queryKey: [
            'aggregate-plan',
            chainId,
            tokenIn?.address,
            tokenOut?.address,
            amountIn.toString(),
            allRoutes.length,
            MIN_AGG_IMPROVEMENT_BPS,
        ],
        queryFn: () =>
            getAggregatePlan(client!, {
                chainId,
                tokenIn: tokenIn!.address as Address,
                tokenOut: tokenOut!.address as Address,
                amountIn,
                routes: allRoutes,
                connectors: getIntermediaryTokens(chainId),
                marginBps: MIN_AGG_IMPROVEMENT_BPS,
            }),
        enabled: isReady,
        staleTime: 10_000,
    })

    return query.data ?? null
}
