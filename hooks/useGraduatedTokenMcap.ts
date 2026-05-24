'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { getV3Config } from '@/lib/dex-config'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'

const Q96 = 2n ** 96n
const TOTAL_SUPPLY = 1_000_000_000 // 1 billion

export function useGraduatedTokenMcap(graduatedAddresses: string[]): Map<string, string> {
    const chainId = PUMP_CORE_NATIVE_CHAIN_ID
    const v3Config = getV3Config(chainId)
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative

    const feeTier = v3Config?.defaultFeeTier ?? 3000

    // Step 1: Batch-read factory.getPool for each graduated token
    const { data: poolAddressResults } = useReadContracts({
        contracts: graduatedAddresses.map((addr) => ({
            address: v3Config!.factory as Address,
            abi: UNISWAP_V3_FACTORY_ABI,
            functionName: 'getPool' as const,
            args: [addr as Address, wrappedNative as Address, feeTier],
            chainId,
        })),
        query: { enabled: graduatedAddresses.length > 0 && !!v3Config && !!wrappedNative },
    })

    // Map token address -> pool address
    const poolMap = useMemo(() => {
        const map = new Map<string, Address>()
        if (!poolAddressResults) return map
        for (const [i, addr] of graduatedAddresses.entries()) {
            const pool = poolAddressResults[i]?.result as Address | undefined
            if (pool && pool !== '0x0000000000000000000000000000000000000000') {
                map.set(addr.toLowerCase(), pool)
            }
        }
        return map
    }, [poolAddressResults, graduatedAddresses])

    const poolAddresses = useMemo(() => [...poolMap.values()], [poolMap])

    // Step 2: Batch-read slot0 for each valid pool
    const { data: slot0Results } = useReadContracts({
        contracts: poolAddresses.map((poolAddr) => ({
            address: poolAddr,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'slot0' as const,
            chainId,
        })),
        query: { enabled: poolAddresses.length > 0 },
    })

    // Step 3: Derive price and compute mcap
    return useMemo(() => {
        const mcapMap = new Map<string, string>()
        if (!slot0Results || !wrappedNative) return mcapMap

        const poolEntries = [...poolMap.entries()]

        for (const [tokenAddr, poolAddr] of poolEntries) {
            const poolIndex = poolAddresses.indexOf(poolAddr)
            if (poolIndex === -1) continue

            const slot0 = slot0Results[poolIndex]?.result as
                | [bigint, number, number, number, number, number, boolean]
                | undefined
            if (!slot0) continue

            const sqrtPriceX96 = slot0[0]
            if (sqrtPriceX96 === 0n) continue

            // Determine token ordering: token0 < token1 (sorted by address)
            const tokenIsToken0 = tokenAddr.toLowerCase() < wrappedNative.toLowerCase()

            // Price of token in native terms
            // sqrtPriceX96 encodes: (token1 per token0) = (sqrtPriceX96 / Q96)^2
            let priceNative: number
            if (tokenIsToken0) {
                // token is token0, native is token1
                // price = how much native per 1 token = (sqrtPriceX96 / Q96)^2
                const priceRaw = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / (Q96 * Q96)
                priceNative = Number(priceRaw) / 1e18
            } else {
                // token is token1, native is token0
                // price = how much native per 1 token = (Q96 / sqrtPriceX96)^2
                const priceRaw = (Q96 * Q96 * 10n ** 18n) / (sqrtPriceX96 * sqrtPriceX96)
                priceNative = Number(priceRaw) / 1e18
            }

            const mcap = priceNative * TOTAL_SUPPLY
            mcapMap.set(tokenAddr, String(mcap))
        }

        return mcapMap
    }, [slot0Results, poolMap, poolAddresses, wrappedNative])
}
