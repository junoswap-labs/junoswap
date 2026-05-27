'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { getV3Config } from '@/lib/dex-config'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { isNativeToken } from '@/lib/wagmi'
import { useQuery } from '@tanstack/react-query'
import { ponderRequest, isPonderError } from '@/lib/ponder-client'
import { PUMP_CORE_NATIVE_CHAIN_ID } from '@/lib/abis/pump-core-native'
import type { Token } from '@/types/tokens'
import type { TokenHolding } from '@/hooks/usePortfolioBalances'
import type { TokenType } from '@/types/portfolio'

const Q96 = 2n ** 96n

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

interface SnapshotResponse {
    tokenSnapshots: {
        items: Array<{
            tokenAddr: string
            lastPrice: string
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

export function usePortfolioPrices(
    holdings: Map<string, TokenHolding>,
    nativeUsdPrice: number | null,
    chainId: number,
    getTokenType: (token: Token) => TokenType
) {
    const v3Config = getV3Config(chainId)
    const wrappedNative = INTERMEDIARY_TOKENS[chainId]?.wrappedNative
    const isLaunchpadChain = chainId === PUMP_CORE_NATIVE_CHAIN_ID
    const feeTiers = v3Config?.feeTiers ?? [3000]

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

    const poolDiscoveryCalls = useMemo(() => {
        const calls: Array<{ tokenAddr: string; feeTier: number }> = []
        for (const { address } of pricedTokens) {
            for (const fee of feeTiers) {
                calls.push({ tokenAddr: address, feeTier: fee })
            }
        }
        return calls
    }, [pricedTokens, feeTiers])

    const { data: poolAddressResults } = useReadContracts({
        contracts: poolDiscoveryCalls.map(({ tokenAddr, feeTier }) => ({
            address: v3Config!.factory as Address,
            abi: UNISWAP_V3_FACTORY_ABI,
            functionName: 'getPool' as const,
            args: [tokenAddr as Address, wrappedNative as Address, feeTier],
            chainId,
        })),
        query: {
            enabled: poolDiscoveryCalls.length > 0 && !!v3Config && !!wrappedNative,
        },
    })

    const poolMap = useMemo(() => {
        const map = new Map<string, Address>()
        if (!poolAddressResults) return map
        for (const [i, { tokenAddr }] of poolDiscoveryCalls.entries()) {
            if (map.has(tokenAddr)) continue
            const pool = poolAddressResults[i]?.result as Address | undefined
            if (pool && pool.toLowerCase() !== ZERO_ADDRESS) {
                map.set(tokenAddr, pool)
            }
        }
        return map
    }, [poolAddressResults, poolDiscoveryCalls])

    const poolAddresses = useMemo(() => [...poolMap.values()], [poolMap])

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
