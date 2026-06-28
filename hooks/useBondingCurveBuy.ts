'use client'

import { useMemo } from 'react'
import { useSimulateContract, useWriteContract, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { BONDING_CURVE_JUNOSWAP_ABI } from '@/lib/abis/bonding-curve-junoswap'
import { useLaunchpadContract } from '@/hooks/useLaunchpadChainId'
import { calculateBuyOutput, calculateMinOutput } from '@/services/launchpad'
import { useSwapStore } from '@/store/swap-store'

interface UseBondingCurveBuyParams {
    tokenAddr: Address | null
    nativeAmount: bigint
    nativeReserve: bigint
    tokenReserve: bigint
    virtualAmount: bigint
    enabled?: boolean
}

interface UseBondingCurveBuyResult {
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

export function useBondingCurveBuy({
    tokenAddr,
    nativeAmount,
    nativeReserve,
    tokenReserve,
    virtualAmount,
    enabled = true,
}: UseBondingCurveBuyParams): UseBondingCurveBuyResult {
    const { settings } = useSwapStore()
    const slippageBps = Math.round(settings.slippage * 100)
    const { chainId, address: bondingCurveAddress } = useLaunchpadContract()
    const publicClient = usePublicClient({ chainId })

    const expectedOut = useMemo(
        () => calculateBuyOutput(nativeAmount, nativeReserve, tokenReserve, virtualAmount),
        [nativeAmount, nativeReserve, tokenReserve, virtualAmount]
    )

    const minTokenOut = useMemo(
        () => calculateMinOutput(expectedOut, slippageBps),
        [expectedOut, slippageBps]
    )

    const { data: simulationData, isLoading: isPreparing } = useSimulateContract({
        address: bondingCurveAddress,
        abi: BONDING_CURVE_JUNOSWAP_ABI,
        functionName: 'buy',
        args: tokenAddr ? [tokenAddr, minTokenOut] : undefined,
        value: nativeAmount,
        chainId,
        query: {
            enabled: !!tokenAddr && !!bondingCurveAddress && nativeAmount > 0n && enabled,
        },
    })

    const {
        data: hash,
        writeContract,
        isPending: isExecuting,
        isError: isWriteError,
        error: writeError,
    } = useWriteContract()

    // Poll for receipt manually (more reliable than useWaitForTransactionReceipt on custom chains)
    const { data: receipt } = useQuery({
        queryKey: ['buy-receipt', hash],
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
