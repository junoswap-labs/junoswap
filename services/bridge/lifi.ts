'use client'

import { getRoutes } from '@lifi/sdk'
import type { Route, RoutesRequest } from '@lifi/types'
import type { Address } from 'viem'

interface BridgeRoutesParams {
    fromChainId: number
    toChainId: number
    fromTokenAddress: string
    toTokenAddress: string
    fromAmount: string
    fromAddress: string
    toAddress?: string
    slippage?: number
}

export async function fetchBridgeRoutes(params: BridgeRoutesParams): Promise<Route[]> {
    const routesRequest: RoutesRequest = {
        fromChainId: params.fromChainId,
        toChainId: params.toChainId,
        fromTokenAddress: params.fromTokenAddress,
        toTokenAddress: params.toTokenAddress,
        fromAmount: params.fromAmount,
        fromAddress: params.fromAddress as Address,
        toAddress: params.toAddress as Address | undefined,
        options: {
            slippage: params.slippage ?? 0.03,
            order: 'RECOMMENDED',
        },
    }

    const response = await getRoutes(routesRequest)
    return response.routes
}
