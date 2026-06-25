'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import type { QuoteResult } from '@/types/swap'
import type { DEXType } from '@/types/dex'
import { getV2Config, getDexsByProtocol, isV2Config, getDexConfig } from '@/lib/dex-config'
import { UNISWAP_V2_ROUTER_ABI } from '@/lib/abis/uniswap-v2-router'
import { UNISWAP_V2_FACTORY_ABI } from '@/lib/abis/uniswap-v2-factory'
import { buildV2QuoteParams } from '@/services/dex/uniswap-v2'
import { isSameToken, getSwapAddress, getWrapOperation } from '@/services/tokens'
import { ProtocolType } from '@/lib/dex-config'

interface UseUniV2QuoteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    dexId?: DEXType | DEXType[]
}

interface DexQuoteResult {
    quote: QuoteResult | null
    isLoading: boolean
    isError: boolean
    error: Error | null
}

interface UseUniV2QuoteResult {
    quotes: Record<DEXType, DexQuoteResult>
    isLoading: boolean
    primaryDexId: DEXType | null
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

export function useUniV2Quote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV2QuoteParams): UseUniV2QuoteResult {
    const chainId = tokenIn?.chainId ?? tokenOut?.chainId ?? 1
    const requestedDexIds = useMemo(() => {
        if (!tokenIn) return []
        if (!dexId) {
            return getDexsByProtocol(chainId, ProtocolType.V2)
        }
        const ids = Array.isArray(dexId) ? dexId : [dexId]
        return ids.filter((id) => {
            const config = getDexConfig(chainId, id)
            return config && isV2Config(config)
        })
    }, [dexId, tokenIn, chainId])
    const wrapOperation = useMemo(() => {
        return getWrapOperation(tokenIn, tokenOut)
    }, [tokenIn, tokenOut])
    const primaryDexId = requestedDexIds[0]
    const dexConfigs = useMemo(() => {
        const configs: Record<DEXType, ReturnType<typeof getV2Config>> = {}
        for (const id of requestedDexIds) {
            configs[id] = getV2Config(chainId, id)
        }
        return configs
    }, [requestedDexIds, chainId])
    const tokenAddresses = useMemo(() => {
        const addresses: Record<DEXType, { tokenIn: Address; tokenOut: Address }> = {}
        for (const id of requestedDexIds) {
            const config = dexConfigs[id]
            addresses[id] = {
                tokenIn: tokenIn
                    ? getSwapAddress(tokenIn.address as Address, chainId, config?.wnative)
                    : ZERO_ADDRESS,
                tokenOut: tokenOut
                    ? getSwapAddress(tokenOut.address as Address, chainId, config?.wnative)
                    : ZERO_ADDRESS,
            }
        }
        return addresses
    }, [requestedDexIds, dexConfigs, tokenIn, tokenOut, chainId])
    const isReadyForQuote =
        enabled &&
        !!tokenIn &&
        !!tokenOut &&
        amountIn > 0n &&
        requestedDexIds.length > 0 &&
        tokenIn.chainId === tokenOut.chainId &&
        !isSameToken(tokenIn, tokenOut) &&
        !wrapOperation
    const pairContracts = useMemo(() => {
        return requestedDexIds.map((id) => ({
            address: dexConfigs[id]?.factory,
            abi: UNISWAP_V2_FACTORY_ABI,
            functionName: 'getPair' as const,
            args: [tokenAddresses[id]?.tokenIn, tokenAddresses[id]?.tokenOut] as [Address, Address],
            chainId,
        }))
    }, [requestedDexIds, dexConfigs, tokenAddresses, chainId])
    const { data: pairResults, isLoading: isPairsLoading } = useReadContracts({
        contracts: pairContracts,
        query: {
            enabled: isReadyForQuote,
            staleTime: 60_000,
        },
    })
    const dexesWithPairs = useMemo(() => {
        if (!pairResults) return []
        return requestedDexIds.filter((_, index) => {
            const result = pairResults[index]
            if (result?.status !== 'success') return false
            const pairAddress = result.result as Address
            return pairAddress && pairAddress !== ZERO_ADDRESS
        })
    }, [requestedDexIds, pairResults])
    const quoteParamsMap = useMemo(() => {
        const params: Record<DEXType, ReturnType<typeof buildV2QuoteParams> | null> = {}
        for (const id of requestedDexIds) {
            if (!tokenIn || !tokenOut || amountIn <= 0n) {
                params[id] = null
            } else {
                params[id] = buildV2QuoteParams(
                    tokenIn.address as Address,
                    tokenOut.address as Address,
                    amountIn,
                    chainId,
                    dexConfigs[id]?.wnative
                )
            }
        }
        return params
    }, [requestedDexIds, tokenIn, tokenOut, amountIn, chainId, dexConfigs])
    const quoteContracts = useMemo(() => {
        return dexesWithPairs.map((id) => {
            const config = dexConfigs[id]
            const params = quoteParamsMap[id]
            return {
                address: config?.router,
                abi: UNISWAP_V2_ROUTER_ABI,
                functionName: 'getAmountsOut' as const,
                args: params
                    ? ([params.amountIn, params.path] as [bigint, readonly Address[]])
                    : undefined,
                chainId,
            }
        })
    }, [dexesWithPairs, dexConfigs, quoteParamsMap, chainId])
    const { data: quoteResults, isLoading: isQuotesLoading } = useReadContracts({
        contracts: quoteContracts,
        query: {
            enabled: isReadyForQuote && dexesWithPairs.length > 0,
            staleTime: 10_000,
        },
    })
    const quotes: Record<DEXType, DexQuoteResult> = useMemo(() => {
        const results: Record<DEXType, DexQuoteResult> = {}
        if (wrapOperation && amountIn > 0n) {
            const wrapQuote: QuoteResult = {
                amountOut: amountIn,
                sqrtPriceX96After: 0n,
                initializedTicksCrossed: 0,
                gasEstimate: wrapOperation === 'wrap' ? 50000n : 40000n,
            }
            for (const id of requestedDexIds) {
                results[id] = {
                    quote: wrapQuote,
                    isLoading: false,
                    isError: false,
                    error: null,
                }
            }
            return results
        }
        for (const id of requestedDexIds) {
            results[id] = {
                quote: null,
                isLoading: isPairsLoading || isQuotesLoading,
                isError: false,
                error: null,
            }
        }
        if (pairResults && !isPairsLoading) {
            for (let i = 0; i < requestedDexIds.length; i++) {
                const id = requestedDexIds[i]
                if (!id) continue
                const pairResult = pairResults[i]
                if (pairResult?.status === 'failure') {
                    results[id] = {
                        quote: null,
                        isLoading: false,
                        isError: true,
                        error: new Error('Failed to check pair'),
                    }
                } else if (pairResult?.status === 'success') {
                    const pairAddress = pairResult.result as Address
                    if (!pairAddress || pairAddress === ZERO_ADDRESS) {
                        results[id] = {
                            quote: null,
                            isLoading: false,
                            isError: true,
                            error: new Error(
                                `No pair found for ${tokenIn?.symbol}/${tokenOut?.symbol}`
                            ),
                        }
                    }
                }
            }
        }
        if (quoteResults && !isQuotesLoading) {
            for (let i = 0; i < dexesWithPairs.length; i++) {
                const id = dexesWithPairs[i]
                if (!id) continue
                const quoteResult = quoteResults[i]
                if (quoteResult?.status === 'success') {
                    const amountsOut = quoteResult.result as readonly bigint[]
                    if (amountsOut && amountsOut.length >= 2) {
                        const amountOut = amountsOut[amountsOut.length - 1]
                        if (amountOut !== undefined) {
                            results[id] = {
                                quote: {
                                    amountOut,
                                    sqrtPriceX96After: 0n,
                                    initializedTicksCrossed: 0,
                                    gasEstimate: 150000n,
                                },
                                isLoading: false,
                                isError: false,
                                error: null,
                            }
                        }
                    }
                } else if (quoteResult?.status === 'failure') {
                    results[id] = {
                        quote: null,
                        isLoading: false,
                        isError: true,
                        error: new Error('Failed to get quote'),
                    }
                }
            }
        }
        return results
    }, [
        wrapOperation,
        amountIn,
        requestedDexIds,
        dexesWithPairs,
        pairResults,
        quoteResults,
        isPairsLoading,
        isQuotesLoading,
        tokenIn?.symbol,
        tokenOut?.symbol,
    ])
    const isLoading = wrapOperation ? false : isPairsLoading || isQuotesLoading
    return {
        quotes,
        isLoading,
        primaryDexId: primaryDexId ?? null,
    }
}
