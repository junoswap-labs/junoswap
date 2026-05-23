'use client'

import { useMemo } from 'react'
import { formatEther } from 'viem'
import type { Address } from 'viem'
import { useReadContracts } from 'wagmi'
import type { V3PoolData } from '@/types/earn'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'

const BALANCE_OF_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const

const Q96 = 2n ** 96n
const MAX_POOLS = 30

function isAddr(a: string, b: string | undefined): boolean {
    return !!b && a.toLowerCase() === b.toLowerCase()
}

function deriveNativeUsdPrice(
    pools: V3PoolData[],
    wrappedNative: string | undefined,
    usdStable: string | undefined
): number | null {
    if (!wrappedNative || !usdStable) return null
    const nativePool = pools.find(
        (p) =>
            (isAddr(p.token0.address, wrappedNative) && isAddr(p.token1.address, usdStable)) ||
            (isAddr(p.token0.address, usdStable) && isAddr(p.token1.address, wrappedNative))
    )
    if (!nativePool) return null

    const sqrtPriceX96 = nativePool.sqrtPriceX96
    if (sqrtPriceX96 === 0n) return null

    const UNIT = 10n ** 18n
    if (isAddr(nativePool.token0.address, wrappedNative)) {
        const priceRaw = (sqrtPriceX96 * sqrtPriceX96 * UNIT) / (Q96 * Q96)
        return Number(priceRaw) / 1e18
    } else {
        const priceRaw = (Q96 * Q96 * UNIT) / (sqrtPriceX96 * sqrtPriceX96)
        return Number(priceRaw) / 1e18
    }
}

function computeTvlUsd(
    balance0: bigint,
    balance1: bigint,
    sqrtPriceX96: bigint,
    isToken0Native: boolean,
    isToken1Native: boolean,
    nativeUsdPrice: number
): number | null {
    if (sqrtPriceX96 === 0n) return null
    if (!isToken0Native && !isToken1Native) return null

    let tvlNativeRaw: bigint
    if (isToken1Native) {
        const value0InNative = (balance0 * sqrtPriceX96 * sqrtPriceX96) / (Q96 * Q96)
        tvlNativeRaw = value0InNative + balance1
    } else {
        const value1InNative = (balance1 * Q96 * Q96) / (sqrtPriceX96 * sqrtPriceX96)
        tvlNativeRaw = balance0 + value1InNative
    }

    const tvlNative = Number(formatEther(tvlNativeRaw))
    return tvlNative * nativeUsdPrice
}

export function usePoolTvl(
    pools: V3PoolData[],
    chainId: number
): {
    tvlByAddress: Record<string, number | null>
    isLoading: boolean
} {
    const cappedPools = pools.length > MAX_POOLS ? pools.slice(0, MAX_POOLS) : pools

    const config = INTERMEDIARY_TOKENS[chainId]
    const wrappedNative = config?.wrappedNative?.toLowerCase()
    const usdStable = config?.stables[0]?.toLowerCase()

    const balanceResults = useReadContracts({
        contracts: cappedPools.flatMap((pool) => [
            {
                address: pool.token0.address as Address,
                abi: BALANCE_OF_ABI,
                functionName: 'balanceOf' as const,
                args: [pool.address as Address],
                chainId,
            },
            {
                address: pool.token1.address as Address,
                abi: BALANCE_OF_ABI,
                functionName: 'balanceOf' as const,
                args: [pool.address as Address],
                chainId,
            },
        ]),
        query: {
            enabled: cappedPools.length > 0,
            staleTime: 30_000,
        },
    })

    const isLoading = balanceResults.isLoading

    const tvlByAddress = useMemo(() => {
        if (!balanceResults.data || cappedPools.length === 0) return {}

        const nativeUsdPrice = deriveNativeUsdPrice(cappedPools, wrappedNative, usdStable)
        const map: Record<string, number | null> = {}

        for (const [i, pool] of cappedPools.entries()) {
            const bal0 = balanceResults.data[i * 2]?.result as bigint | undefined
            const bal1 = balanceResults.data[i * 2 + 1]?.result as bigint | undefined

            if (bal0 === undefined || bal1 === undefined) continue

            const isToken0Native = isAddr(pool.token0.address, wrappedNative)
            const isToken1Native = isAddr(pool.token1.address, wrappedNative)

            if (nativeUsdPrice) {
                map[pool.address.toLowerCase()] = computeTvlUsd(
                    bal0,
                    bal1,
                    pool.sqrtPriceX96,
                    isToken0Native,
                    isToken1Native,
                    nativeUsdPrice
                )
            } else {
                if (pool.sqrtPriceX96 > 0n) {
                    if (isToken1Native) {
                        const value0 = (bal0 * pool.sqrtPriceX96 * pool.sqrtPriceX96) / (Q96 * Q96)
                        map[pool.address.toLowerCase()] = Number(formatEther(value0 + bal1))
                    } else if (isToken0Native) {
                        const value1 = (bal1 * Q96 * Q96) / (pool.sqrtPriceX96 * pool.sqrtPriceX96)
                        map[pool.address.toLowerCase()] = Number(formatEther(bal0 + value1))
                    }
                }
            }
        }
        return map
    }, [balanceResults.data, cappedPools, wrappedNative, usdStable])

    return { tvlByAddress, isLoading }
}
