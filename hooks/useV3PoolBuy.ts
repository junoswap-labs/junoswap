'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { useSimulateContract, useWriteContract, usePublicClient, useReadContract } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { BONDING_CURVE_JUNOSWAP_CHAIN_ID } from '@/lib/abis/bonding-curve-junoswap'
import { getV3Config } from '@/lib/dex-config'
import { UNISWAP_V3_QUOTER_V2_ABI } from '@/lib/abis/uniswap-v3-quoter'
import { UNISWAP_V3_SWAP_ROUTER_ABI } from '@/lib/abis/uniswap-v3-swap-router'
import { buildQuoteParams } from '@/services/dex/uniswap-v3'
import { calculateMinOutput } from '@/services/launchpad'
import { useSwapStore } from '@/store/swap-store'

interface UseV3PoolBuyParams {
    tokenAddr: Address | null
    wrappedNative: Address
    nativeAmount: bigint
    poolFee: number
    enabled?: boolean
}

interface UseV3PoolBuyResult {
    buy: () => void
    expectedOut: bigint
    minTokenOut: bigint
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
}

export function useV3PoolBuy({
    tokenAddr,
    wrappedNative,
    nativeAmount,
    poolFee,
    enabled = true,
}: UseV3PoolBuyParams): UseV3PoolBuyResult {
    const { address } = useAccount()
    const { settings } = useSwapStore()
    const slippageBps = Math.round(settings.slippage * 100)
    const publicClient = usePublicClient({ chainId: BONDING_CURVE_JUNOSWAP_CHAIN_ID })
    const v3Config = getV3Config(BONDING_CURVE_JUNOSWAP_CHAIN_ID)

    // Quote from V3 quoter
    const quoteParams =
        enabled && tokenAddr && nativeAmount > 0n
            ? buildQuoteParams(
                  wrappedNative,
                  tokenAddr,
                  nativeAmount,
                  poolFee,
                  BONDING_CURVE_JUNOSWAP_CHAIN_ID
              )
            : null

    const { data: quoteData } = useReadContract({
        address: v3Config?.quoter,
        abi: UNISWAP_V3_QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: quoteParams ? [quoteParams] : undefined,
        chainId: BONDING_CURVE_JUNOSWAP_CHAIN_ID,
        query: {
            enabled: !!quoteParams && !!v3Config,
            staleTime: 10_000,
        },
    })

    const expectedOut = useMemo(() => {
        if (!quoteData) return 0n
        return (quoteData as [bigint, bigint, number, bigint])[0]
    }, [quoteData])

    const minTokenOut = useMemo(
        () => calculateMinOutput(expectedOut, slippageBps),
        [expectedOut, slippageBps]
    )

    // Simulate exactInputSingle on SwapRouter
    const { data: simulationData, isLoading: isPreparing } = useSimulateContract({
        address: v3Config?.swapRouter,
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args:
            tokenAddr && address
                ? [
                      {
                          tokenIn: wrappedNative,
                          tokenOut: tokenAddr,
                          fee: poolFee,
                          recipient: address,
                          amountIn: nativeAmount,
                          amountOutMinimum: minTokenOut,
                          sqrtPriceLimitX96: 0n,
                      },
                  ]
                : undefined,
        value: nativeAmount,
        chainId: BONDING_CURVE_JUNOSWAP_CHAIN_ID,
        query: {
            enabled: enabled && !!tokenAddr && !!address && nativeAmount > 0n && !!v3Config,
        },
    })

    const {
        data: hash,
        writeContract,
        isPending: isExecuting,
        isError: isWriteError,
        error: writeError,
    } = useWriteContract()

    const { data: receipt } = useQuery({
        queryKey: ['v3-buy-receipt', hash],
        queryFn: async () => {
            if (!hash || !publicClient) return null
            return publicClient.getTransactionReceipt({ hash })
        },
        enabled: !!hash && !!publicClient,
        refetchInterval: (query) => {
            if (query.state.data) return false
            return 2000
        },
    })

    const isConfirming = !!hash && !receipt
    const isSuccess = !!receipt && receipt.status === 'success'
    const isError = isWriteError || (!!receipt && receipt.status === 'reverted')
    const error =
        writeError ||
        (isError && receipt?.status === 'reverted' ? new Error('Transaction reverted') : null)

    const buy = () => {
        if (!simulationData?.request) return
        writeContract(simulationData.request)
    }

    return {
        buy,
        expectedOut,
        minTokenOut,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        isError,
        error: error as Error | null,
        hash,
    }
}
