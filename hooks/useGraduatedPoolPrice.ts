'use client'

import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import { V3_POOL_ABI, calculatePriceFromSqrtPrice, TOTAL_SUPPLY } from '@coshi190/juno-moneta-sdk'

interface UseGraduatedPoolPriceParams {
    poolAddress?: Address
    tokenAddr?: Address
    wrappedNative?: Address
    chainId: number
    isGraduated?: boolean
}

interface UseGraduatedPoolPriceResult {
    price: number | null
    marketCap: number | null
}

// Live on-chain slot0 price for a graduated token's V3 pool — the same source
// the chart uses for its last candle, so the header stat stays in sync with it
// instead of trailing the indexer's periodically-updated snapshot.
export function useGraduatedPoolPrice({
    poolAddress,
    tokenAddr,
    wrappedNative,
    chainId,
    isGraduated,
}: UseGraduatedPoolPriceParams): UseGraduatedPoolPriceResult {
    const { data: slot0 } = useReadContract({
        address: poolAddress,
        abi: V3_POOL_ABI,
        functionName: 'slot0' as const,
        chainId,
        query: {
            enabled: !!isGraduated && !!poolAddress,
            refetchInterval: 15_000,
        },
    })

    if (!slot0 || !tokenAddr || !wrappedNative) {
        return { price: null, marketCap: null }
    }

    const sqrtPriceX96 = (slot0 as [bigint, number, number, number, number, number, boolean])[0]
    if (!sqrtPriceX96 || sqrtPriceX96 <= 0n) {
        return { price: null, marketCap: null }
    }

    const tokenIsToken0 = tokenAddr.toLowerCase() < wrappedNative.toLowerCase()
    const price = calculatePriceFromSqrtPrice(sqrtPriceX96, tokenIsToken0)
    if (price <= 0) return { price: null, marketCap: null }

    return { price, marketCap: price * TOTAL_SUPPLY }
}
