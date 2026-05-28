'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { isNativeToken } from '@/lib/wagmi'
import { useQuery } from '@tanstack/react-query'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import type { Token } from '@/types/tokens'
import type { TokenHolding } from '@/hooks/usePortfolioBalances'
import type { TokenType } from '@/types/portfolio'

const Q96 = 2n ** 96n

interface SnapshotResponse {
    tokenSnapshots: {
        items: Array<{
            tokenAddr: string
            lastPrice: string
        }>
    }
}

interface V3PoolResponse {
    v3Pools: {
        items: Array<{
            address: string
            token0: string
            token1: string
            fee: number
        }>
    }
}

const SNAPSHOTS_QUERY = `
  query TokenSnapshots($addresses: [String!]) {
    tokenSnapshots(where: { tokenAddr_in: $addresses }, limit: 100) {
      items {
        tokenAddr
        lastPrice
      }
    }
  }
`

const V3_POOLS_QUERY = `
  query V3Pools($chainId: Int!, $wrappedNative: String!) {
    v3Pools(
      where: {
        chainId: $chainId,
        or: [
          { token0: $wrappedNative },
          { token1: $wrappedNative }
        ]
      },
      limit: 500
    ) {
      items {
        address
        token0
        token1
        fee
      }
    }
  }
`

export function usePortfolioPrices(
    holdings: Map<string, TokenHolding>,
    nativeUsdPrice: number | null,
    chainId: number,
    getTokenType: (token: Token) => TokenType
) {
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    const isLaunchpadChain = chainId === PUMP_CORE_NATIVE_CHAIN_ID

    const pricedTokens = useMemo(() => {
        const tokens: Array<{ address: string; token: Token; tokenType: TokenType }> = []
        for (const [key, holding] of holdings) {
            const tokenType = getTokenType(holding.token)
            const isNative = isNativeToken(holding.token.address)
            if (
                (!isNative && tokenType !== 'static') ||
                (tokenType === 'static' && !isStablecoin(holding.token))
            ) {
                if (tokenType !== 'static' || !isWrappedNative(holding.token, chainId)) {
                    tokens.push({ address: key, token: holding.token, tokenType })
                }
            }
        }
        return tokens
    }, [holdings, getTokenType, chainId])

    // Replace factory.getPool() calls with a single Ponder query
    const { data: ponderPools } = useQuery({
        queryKey: ['v3-pools-for-pricing', chainId, wrappedNative],
        queryFn: async () => {
            if (!wrappedNative) return []
            try {
                const data = await ponderRequest<V3PoolResponse>(V3_POOLS_QUERY, {
                    chainId,
                    wrappedNative: wrappedNative.toLowerCase(),
                })
                return data.v3Pools.items
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: pricedTokens.length > 0 && !!wrappedNative,
        staleTime: 60_000,
    })

    // Build pool map: tokenAddr → best pool address (first fee tier found)
    const poolMap = useMemo(() => {
        const map = new Map<string, Address>()
        if (!ponderPools || !wrappedNative) return map

        const wn = wrappedNative.toLowerCase()
        for (const pool of ponderPools) {
            const token0 = pool.token0.toLowerCase()
            const token1 = pool.token1.toLowerCase()
            const tokenAddr = token0 === wn ? token1 : token0 === wn ? token0 : null
            if (tokenAddr && !map.has(tokenAddr)) {
                map.set(tokenAddr, pool.address as Address)
            }
        }
        return map
    }, [ponderPools, wrappedNative])

    const poolAddresses = useMemo(() => [...poolMap.values()], [poolMap])

    // Still need on-chain slot0() for live sqrtPriceX96
    const { data: slot0Results } = useReadContracts({
        contracts: poolAddresses.map((poolAddr) => ({
            address: poolAddr,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'slot0' as const,
            chainId,
        })),
        query: { enabled: poolAddresses.length > 0 },
    })

    const bondingCurveAddresses = useMemo(
        () => pricedTokens.filter((t) => t.tokenType === 'bonding_curve').map((t) => t.address),
        [pricedTokens]
    )

    const { data: snapshots } = useQuery({
        queryKey: ['token-snapshots-prices', bondingCurveAddresses],
        queryFn: async () => {
            if (!isLaunchpadChain || bondingCurveAddresses.length === 0) return []
            try {
                const data = await ponderRequest<SnapshotResponse>(SNAPSHOTS_QUERY, {
                    addresses: bondingCurveAddresses,
                })
                return data.tokenSnapshots.items
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: isLaunchpadChain && bondingCurveAddresses.length > 0,
        staleTime: 30_000,
    })

    const snapshotMap = useMemo(() => {
        const map = new Map<string, number>()
        if (!snapshots) return map
        for (const s of snapshots) {
            map.set(s.tokenAddr.toLowerCase(), parseFloat(s.lastPrice))
        }
        return map
    }, [snapshots])

    return useMemo(() => {
        const priceMap = new Map<string, number | null>()

        for (const [key, holding] of holdings) {
            const tokenType = getTokenType(holding.token)
            const isNative = isNativeToken(holding.token.address)

            if (isNative) {
                priceMap.set(key, nativeUsdPrice)
            } else if (isWrappedNative(holding.token, chainId)) {
                priceMap.set(key, nativeUsdPrice)
            } else if (isStablecoin(holding.token)) {
                priceMap.set(key, 1.0)
            } else if (tokenType === 'bonding_curve') {
                const priceNative = snapshotMap.get(key)
                if (priceNative !== undefined && nativeUsdPrice !== null) {
                    priceMap.set(key, priceNative * nativeUsdPrice)
                } else {
                    priceMap.set(key, null)
                }
            } else {
                const poolAddr = poolMap.get(key)
                if (poolAddr && slot0Results && wrappedNative) {
                    const poolIndex = poolAddresses.indexOf(poolAddr)
                    const slot0 = slot0Results[poolIndex]?.result as
                        | [bigint, number, number, number, number, number, boolean]
                        | undefined

                    if (slot0 && slot0[0] !== 0n && nativeUsdPrice !== null) {
                        const sqrtPriceX96 = slot0[0]
                        const tokenIsToken0 = key < wrappedNative.toLowerCase()
                        let priceNative: number
                        if (tokenIsToken0) {
                            const priceRaw =
                                (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / (Q96 * Q96)
                            priceNative = Number(priceRaw) / 1e18
                        } else {
                            const priceRaw =
                                (Q96 * Q96 * 10n ** 18n) / (sqrtPriceX96 * sqrtPriceX96)
                            priceNative = Number(priceRaw) / 1e18
                        }
                        priceMap.set(key, priceNative * nativeUsdPrice)
                    } else {
                        priceMap.set(key, null)
                    }
                } else {
                    priceMap.set(key, null)
                }
            }
        }

        return priceMap
    }, [
        holdings,
        getTokenType,
        nativeUsdPrice,
        chainId,
        poolMap,
        slot0Results,
        poolAddresses,
        wrappedNative,
        snapshotMap,
    ])
}

const STABLECOIN_SYMBOLS = new Set(['USDT', 'USDC', 'KUSDT', 'JUSDT', 'DAI', 'BUSD'])

function isStablecoin(token: Token): boolean {
    return STABLECOIN_SYMBOLS.has(token.symbol.toUpperCase())
}

function isWrappedNative(token: Token, chainId: number): boolean {
    const wrapped = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    return !!wrapped && token.address.toLowerCase() === wrapped.toLowerCase()
}
