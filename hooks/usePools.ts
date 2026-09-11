'use client'

import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import {
    ProtocolType,
    getDexConfig,
    V3_FACTORY_ABI,
    V3_POOL_ABI,
    sortTokens,
    getTickSpacing,
} from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { V3PoolData } from '@/types/earn'

export function usePool(
    token0: Token | null,
    token1: Token | null,
    fee: number,
    chainId?: number
): {
    pool: V3PoolData | null
    isLoading: boolean
    isError: boolean
    error: Error | null
} {
    const effectiveChainId = chainId ?? token0?.chainId ?? token1?.chainId ?? 1
    const dexConfig = getDexConfig(effectiveChainId, undefined, ProtocolType.V3)
    const [sortedToken0, sortedToken1] = useMemo(() => {
        if (!token0 || !token1) return [null, null]
        return sortTokens(token0, token1)
    }, [token0, token1])
    const isEnabled = !!sortedToken0 && !!sortedToken1 && !!dexConfig
    const {
        data: poolAddress,
        isLoading: isLoadingPool,
        isError: isPoolError,
        error: poolError,
    } = useReadContract({
        address: dexConfig?.factory,
        abi: V3_FACTORY_ABI,
        functionName: 'getPool',
        args: isEnabled ? [sortedToken0!.address, sortedToken1!.address, fee] : undefined,
        chainId: effectiveChainId,
        query: {
            enabled: isEnabled,
            staleTime: 60_000, // 1 minute
        },
    })
    const isValidPool = poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000'
    const {
        data: poolState,
        isLoading: isLoadingState,
        isError: isStateError,
        error: stateError,
    } = useReadContracts({
        contracts: [
            {
                address: poolAddress as Address,
                abi: V3_POOL_ABI,
                functionName: 'slot0',
                chainId: effectiveChainId,
            },
            {
                address: poolAddress as Address,
                abi: V3_POOL_ABI,
                functionName: 'liquidity',
                chainId: effectiveChainId,
            },
        ],
        query: {
            enabled: isValidPool,
            staleTime: 10_000, // 10 seconds
        },
    })
    const pool = useMemo<V3PoolData | null>(() => {
        if (!isValidPool || !poolState || !sortedToken0 || !sortedToken1) return null
        const slot0 = poolState[0]?.result as
            | [bigint, number, number, number, number, number, boolean]
            | undefined
        const liquidity = poolState[1]?.result as bigint | undefined
        if (!slot0 || liquidity === undefined) return null
        const [sqrtPriceX96, tick] = slot0
        return {
            address: poolAddress as Address,
            token0: sortedToken0,
            token1: sortedToken1,
            fee,
            liquidity,
            sqrtPriceX96,
            tick,
            tickSpacing: getTickSpacing(fee),
        }
    }, [isValidPool, poolAddress, poolState, sortedToken0, sortedToken1, fee])
    return {
        pool,
        isLoading: isLoadingPool || isLoadingState,
        isError: isPoolError || isStateError,
        error: poolError || stateError || null,
    }
}
