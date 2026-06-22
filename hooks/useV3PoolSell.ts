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
import { buildQuoteParams, buildMulticallSwapToNative } from '@/services/dex/uniswap-v3'
import { calculateMinOutput } from '@/services/launchpad'
import { useSwapStore } from '@/store/swap-store'
import type { SwapParams } from '@/types/swap'

interface UseV3PoolSellParams {
    tokenAddr: Address | null
    wrappedNative: Address
    tokenAmount: bigint
    poolFee: number
    enabled?: boolean
}

interface UseV3PoolSellResult {
    sell: () => void
    expectedOut: bigint
    minNativeOut: bigint
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
}

export function useV3PoolSell({
    tokenAddr,
    wrappedNative,
    tokenAmount,
    poolFee,
    enabled = true,
}: UseV3PoolSellParams): UseV3PoolSellResult {
    const { address } = useAccount()
    const { settings } = useSwapStore()
    const slippageBps = Math.round(settings.slippage * 100)
    const publicClient = usePublicClient({ chainId: BONDING_CURVE_JUNOSWAP_CHAIN_ID })
    const v3Config = getV3Config(BONDING_CURVE_JUNOSWAP_CHAIN_ID)

    // Quote from V3 quoter
    const quoteParams =
        enabled && tokenAddr && tokenAmount > 0n
            ? buildQuoteParams(
                  tokenAddr,
                  wrappedNative,
                  tokenAmount,
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

    const minNativeOut = useMemo(
        () => calculateMinOutput(expectedOut, slippageBps),
        [expectedOut, slippageBps]
    )

    // Build multicall: [exactInputSingle, unwrapWETH9]
    const multicallData = useMemo(() => {
        if (!tokenAddr || !address || tokenAmount === 0n) return null
        const swapParams: SwapParams = {
            tokenIn: tokenAddr,
            tokenOut: wrappedNative,
            amountIn: tokenAmount,
            amountOutMinimum: minNativeOut,
            recipient: address,
            slippageTolerance: slippageBps,
            deadline: Math.floor(Date.now() / 1000) + 20 * 60,
        }
        return buildMulticallSwapToNative(swapParams, poolFee, BONDING_CURVE_JUNOSWAP_CHAIN_ID)
    }, [tokenAddr, wrappedNative, tokenAmount, minNativeOut, address, poolFee, slippageBps])

    // Simulate multicall on SwapRouter
    const { data: simulationData, isLoading: isPreparing } = useSimulateContract({
        address: v3Config?.swapRouter,
        abi: UNISWAP_V3_SWAP_ROUTER_ABI,
        functionName: 'multicall',
        args: multicallData ? [multicallData] : undefined,
        chainId: BONDING_CURVE_JUNOSWAP_CHAIN_ID,
        query: {
            enabled:
                enabled &&
                !!tokenAddr &&
                !!address &&
                tokenAmount > 0n &&
                !!v3Config &&
                !!multicallData,
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
        queryKey: ['v3-sell-receipt', hash],
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

    const sell = () => {
        if (!simulationData?.request) return
        writeContract(simulationData.request)
    }

    return {
        sell,
        expectedOut,
        minNativeOut,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        isError,
        error: error as Error | null,
        hash,
    }
}
