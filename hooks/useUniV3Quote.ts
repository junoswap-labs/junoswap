'use client'

import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import type { QuoteResult } from '@/types/swap'
import type { DEXType } from '@/types/dex'
import {
    getV3Config,
    FEE_TIERS,
    getDexsByProtocol,
    isV3Config,
    getDexConfig,
} from '@/lib/dex-config'
import { UNISWAP_V3_QUOTER_V2_ABI } from '@/lib/abis/uniswap-v3-quoter'
import { UNISWAP_V3_FACTORY_ABI } from '@/lib/abis/uniswap-v3-factory'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { buildQuoteParams } from '@/services/dex/uniswap-v3'
import { isSameToken, getSwapAddress, getWrapOperation } from '@/services/tokens'
import { ProtocolType } from '@/lib/dex-config'

export interface UseUniV3QuoteParams {
    tokenIn: Token | null
    tokenOut: Token | null
    amountIn: bigint
    enabled?: boolean
    dexId?: DEXType | DEXType[]
}

export interface UseUniV3QuoteResult {
    quote: QuoteResult | null
    isLoading: boolean
    isError: boolean
    error: Error | null
    fee: number | null
    primaryDexId: DEXType | null
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

export function useUniV3Quote({
    tokenIn,
    tokenOut,
    amountIn,
    enabled = true,
    dexId,
}: UseUniV3QuoteParams): UseUniV3QuoteResult {
    const chainId = tokenIn?.chainId ?? 1
    const requestedDexIds = useMemo(() => {
        if (!tokenIn) return []
        if (!dexId) {
            return getDexsByProtocol(chainId, ProtocolType.V3)
        }
        const ids = Array.isArray(dexId) ? dexId : [dexId]
        return ids.filter((id) => {
            const config = getDexConfig(chainId, id)
            return config && isV3Config(config)
        })
    }, [dexId, tokenIn, chainId])
    const wrapOperation = useMemo(() => {
        return getWrapOperation(tokenIn, tokenOut)
    }, [tokenIn, tokenOut])
    const tokenInAddress = useMemo(() => {
        if (!tokenIn) return ZERO_ADDRESS
        return getSwapAddress(tokenIn.address as Address, chainId)
    }, [tokenIn, chainId])
    const tokenOutAddress = useMemo(() => {
        if (!tokenOut) return ZERO_ADDRESS
        return getSwapAddress(tokenOut.address as Address, chainId)
    }, [tokenOut, chainId])
    const primaryDexId = requestedDexIds[0]
    const dexConfig = primaryDexId ? getV3Config(chainId, primaryDexId) : null
    const isReadyForQuote =
        enabled &&
        !!tokenIn &&
        !!tokenOut &&
        amountIn > 0n &&
        !!dexConfig &&
        tokenIn.chainId === tokenOut.chainId &&
        !isSameToken(tokenIn, tokenOut) &&
        !wrapOperation
    const poolStable = useReadContract({
        address: dexConfig?.factory,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: 'getPool',
        args: [tokenInAddress, tokenOutAddress, FEE_TIERS.STABLE],
        chainId,
        query: { enabled: isReadyForQuote, staleTime: 60_000 },
    })
    const poolLow = useReadContract({
        address: dexConfig?.factory,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: 'getPool',
        args: [tokenInAddress, tokenOutAddress, FEE_TIERS.LOW],
        chainId,
        query: { enabled: isReadyForQuote, staleTime: 60_000 },
    })
    const poolMedium = useReadContract({
        address: dexConfig?.factory,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: 'getPool',
        args: [tokenInAddress, tokenOutAddress, FEE_TIERS.MEDIUM],
        chainId,
        query: { enabled: isReadyForQuote, staleTime: 60_000 },
    })
    const poolHigh = useReadContract({
        address: dexConfig?.factory,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: 'getPool',
        args: [tokenInAddress, tokenOutAddress, FEE_TIERS.HIGH],
        chainId,
        query: { enabled: isReadyForQuote, staleTime: 60_000 },
    })
    const poolStableAddr = poolStable.data as Address | undefined
    const poolLowAddr = poolLow.data as Address | undefined
    const poolMediumAddr = poolMedium.data as Address | undefined
    const poolHighAddr = poolHigh.data as Address | undefined
    const isValidPool = (addr: Address | undefined) => addr && addr !== ZERO_ADDRESS
    const liqStable = useReadContract({
        address: isValidPool(poolStableAddr) ? poolStableAddr : undefined,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'liquidity',
        chainId,
        query: { enabled: isValidPool(poolStableAddr), staleTime: 60_000 },
    })
    const liqLow = useReadContract({
        address: isValidPool(poolLowAddr) ? poolLowAddr : undefined,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'liquidity',
        chainId,
        query: { enabled: isValidPool(poolLowAddr), staleTime: 60_000 },
    })
    const liqMedium = useReadContract({
        address: isValidPool(poolMediumAddr) ? poolMediumAddr : undefined,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'liquidity',
        chainId,
        query: { enabled: isValidPool(poolMediumAddr), staleTime: 60_000 },
    })
    const liqHigh = useReadContract({
        address: isValidPool(poolHighAddr) ? poolHighAddr : undefined,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'liquidity',
        chainId,
        query: { enabled: isValidPool(poolHighAddr), staleTime: 60_000 },
    })
    const { bestPool, bestFee, isLoadingPool } = useMemo(() => {
        const pools = [
            {
                fee: FEE_TIERS.STABLE,
                addr: poolStableAddr,
                liq: liqStable.data as bigint | undefined,
                loading: poolStable.isLoading || liqStable.isLoading,
            },
            {
                fee: FEE_TIERS.LOW,
                addr: poolLowAddr,
                liq: liqLow.data as bigint | undefined,
                loading: poolLow.isLoading || liqLow.isLoading,
            },
            {
                fee: FEE_TIERS.MEDIUM,
                addr: poolMediumAddr,
                liq: liqMedium.data as bigint | undefined,
                loading: poolMedium.isLoading || liqMedium.isLoading,
            },
            {
                fee: FEE_TIERS.HIGH,
                addr: poolHighAddr,
                liq: liqHigh.data as bigint | undefined,
                loading: poolHigh.isLoading || liqHigh.isLoading,
            },
        ]
        const isLoading = pools.some((p) => p.loading)
        const validPools = pools.filter((p) => isValidPool(p.addr) && p.liq && p.liq > 0n)
        const best = validPools.sort((a, b) => (b.liq! > a.liq! ? 1 : -1))[0]
        return {
            bestPool: best?.addr ?? null,
            bestFee: best?.fee ?? null,
            isLoadingPool: isLoading,
        }
    }, [
        poolStableAddr,
        poolLowAddr,
        poolMediumAddr,
        poolHighAddr,
        liqStable.data,
        liqLow.data,
        liqMedium.data,
        liqHigh.data,
        poolStable.isLoading,
        poolLow.isLoading,
        poolMedium.isLoading,
        poolHigh.isLoading,
        liqStable.isLoading,
        liqLow.isLoading,
        liqMedium.isLoading,
        liqHigh.isLoading,
    ])
    const quoteParams =
        isReadyForQuote && bestPool && bestFee
            ? buildQuoteParams(
                  tokenIn.address as Address,
                  tokenOut.address as Address,
                  amountIn,
                  bestFee,
                  tokenIn.chainId
              )
            : null
    const {
        data,
        isLoading: isQuoteLoading,
        isError: isQuoteError,
        error,
    } = useReadContract({
        address: dexConfig?.quoter,
        abi: UNISWAP_V3_QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: quoteParams ? [quoteParams] : undefined,
        chainId: tokenIn?.chainId,
        query: {
            enabled: isReadyForQuote && !!bestPool,
            staleTime: 10_000,
        },
    })
    const quote: QuoteResult | null = useMemo(() => {
        if (wrapOperation && amountIn > 0n) {
            return {
                amountOut: amountIn,
                sqrtPriceX96After: 0n,
                initializedTicksCrossed: 0,
                gasEstimate: wrapOperation === 'wrap' ? 50000n : 40000n,
            }
        }
        if (data) {
            return {
                amountOut: data[0],
                sqrtPriceX96After: data[1],
                initializedTicksCrossed: Number(data[2]),
                gasEstimate: data[3],
            }
        }
        return null
    }, [wrapOperation, amountIn, data])
    const isLoading = wrapOperation ? false : isQuoteLoading || isLoadingPool
    const isError =
        isQuoteError || (!wrapOperation && !isLoadingPool && !bestPool && tokenIn && tokenOut)
    const displayError: Error | null = useMemo(() => {
        if (error) return error as Error
        if (!wrapOperation && !isLoadingPool && !bestPool && tokenIn && tokenOut) {
            return new Error(`No pool found for ${tokenIn.symbol}/${tokenOut.symbol}`)
        }
        return null
    }, [error, wrapOperation, isLoadingPool, bestPool, tokenIn, tokenOut])
    return {
        quote,
        isLoading,
        isError: !!isError,
        error: displayError,
        fee: bestFee,
        primaryDexId: primaryDexId ?? null,
    }
}
