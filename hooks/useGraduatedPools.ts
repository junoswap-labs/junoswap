'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { getV3Config } from '@/lib/dex-config'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { TOKEN_LISTS } from '@/lib/tokens'
import { isLaunchpadChain as isLaunchpadChainFn } from '@/lib/abis/bonding-curve-junoswap'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { sortTokens, getTickSpacing } from '@/lib/liquidity-helpers'
import { useGraduatedTokens } from '@/hooks/useGraduatedTokens'
import type { V3PoolData } from '@/types/earn'
import type { Token } from '@/types/tokens'

const GRADUATED_FEE_TIER = 10000

export function useGraduatedPools(chainId: number): { pools: V3PoolData[]; isLoading: boolean } {
    const isLaunchpadChain = isLaunchpadChainFn(chainId)
    const v3Config = getV3Config(chainId)
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    const wrappedNativeToken = TOKEN_LISTS[chainId]?.find(
        (t) => t.address.toLowerCase() === wrappedNative?.toLowerCase()
    )

    const { tokens: enrichedTokens, isLoading: isLoadingTokens } = useGraduatedTokens(chainId)

    // Pool discovery — batch factory.getPool
    const { data: poolAddressResults, isLoading: isLoadingPools } = useReadContracts({
        contracts: enrichedTokens.map((t) => ({
            address: v3Config!.factory as Address,
            abi: UNISWAP_V3_FACTORY_ABI,
            functionName: 'getPool' as const,
            args: [t.address as Address, wrappedNative as Address, GRADUATED_FEE_TIER],
            chainId,
        })),
        query: { enabled: enrichedTokens.length > 0 && isLaunchpadChain && !isLoadingTokens },
    })

    // Map token index -> valid pool address
    const validPools = useMemo(() => {
        if (!poolAddressResults) return []
        return poolAddressResults
            .map((result, index) => ({
                tokenIndex: index,
                address: result.result as Address | undefined,
            }))
            .filter((p) => p.address && p.address !== '0x0000000000000000000000000000000000000000')
    }, [poolAddressResults])

    // Pool state — batch slot0 + liquidity
    const { data: poolStateResults, isLoading: isLoadingState } = useReadContracts({
        contracts: validPools.flatMap((p) => [
            {
                address: p.address as Address,
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'slot0' as const,
                chainId,
            },
            {
                address: p.address as Address,
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'liquidity' as const,
                chainId,
            },
        ]),
        query: { enabled: validPools.length > 0 && isLaunchpadChain },
    })

    const pools = useMemo<V3PoolData[]>(() => {
        if (!poolStateResults || !wrappedNativeToken) return []

        return validPools
            .map((pool, index) => {
                const slot0 = poolStateResults[index * 2]?.result as
                    | [bigint, number, number, number, number, number, boolean]
                    | undefined
                const liquidity = poolStateResults[index * 2 + 1]?.result as bigint | undefined
                if (!slot0 || liquidity === undefined || liquidity === 0n) return null

                const [sqrtPriceX96, tick] = slot0
                const tokenMeta = enrichedTokens[pool.tokenIndex]
                if (!tokenMeta) return null

                const launchToken: Token = {
                    address: tokenMeta.address,
                    symbol: tokenMeta.symbol,
                    name: tokenMeta.name,
                    decimals: 18,
                    chainId,
                    logo: tokenMeta.logo,
                }

                const [token0, token1] = sortTokens(launchToken, wrappedNativeToken)

                return {
                    address: pool.address as Address,
                    token0,
                    token1,
                    fee: GRADUATED_FEE_TIER,
                    liquidity,
                    sqrtPriceX96,
                    tick,
                    tickSpacing: getTickSpacing(GRADUATED_FEE_TIER),
                }
            })
            .filter((p): p is V3PoolData => p !== null)
    }, [poolStateResults, validPools, enrichedTokens, wrappedNativeToken])

    if (!isLaunchpadChain) {
        return { pools: [], isLoading: false }
    }

    return {
        pools,
        isLoading: isLoadingTokens || isLoadingPools || isLoadingState,
    }
}
