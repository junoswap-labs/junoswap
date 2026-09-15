'use client'

import { useMemo } from 'react'
import {
    useWaitForTransactionReceipt,
    useSimulateContract,
    useSendTransaction,
    type UseSimulateContractParameters,
} from 'wagmi'
import { type Address } from 'viem'
import { getAggregatePlan, planSwap } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { SwapResult } from '@/types/swap'
import { toastError } from '@/lib/toast'
import { useReferrer } from '@/hooks/useReferrer'

type AggregatePlan = NonNullable<Awaited<ReturnType<typeof getAggregatePlan>>>['plan']

interface UseAggRouterSwapExecutionParams {
    tokenIn: Token
    tokenOut: Token
    amountIn: bigint
    amountOutMinimum: bigint
    recipient: Address
    deadlineMinutes: number
    plan: AggregatePlan | null
    skipSimulation?: boolean
}

interface UseAggRouterSwapExecutionResult {
    swap: () => void
    canSwap: boolean
    result: SwapResult | null
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
    simulationError: Error | null
    isWrapUnwrap: boolean
}

export function useAggRouterSwapExecution({
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMinimum,
    recipient,
    deadlineMinutes,
    plan,
    skipSimulation = false,
}: UseAggRouterSwapExecutionParams): UseAggRouterSwapExecutionResult {
    const referrer = useReferrer()
    const chainId = tokenIn.chainId

    const swapPlan = useMemo<ReturnType<typeof planSwap> | null>(() => {
        if (!plan || amountIn <= 0n) return null
        try {
            return planSwap({
                chainId,
                tokenIn: tokenIn.address as Address,
                tokenOut: tokenOut.address as Address,
                amountIn,
                amountOutMin: amountOutMinimum,
                recipient,
                deadline: Math.floor(Date.now() / 1000) + deadlineMinutes * 60,
                referrer,
                aggregate: plan,
            })
        } catch {
            // Unroutable legs or no router on this chain — surfaced as a toast on submit.
            return null
        }
    }, [
        plan,
        chainId,
        tokenIn.address,
        tokenOut.address,
        amountIn,
        amountOutMinimum,
        recipient,
        deadlineMinutes,
        referrer,
    ])

    const simulateConfig: UseSimulateContractParameters = {
        address: swapPlan?.call.address,
        abi: swapPlan?.call.abi,
        functionName: swapPlan?.call.functionName,
        args: swapPlan?.call.args,
        value: swapPlan?.call.value,
        chainId,
        query: { enabled: amountIn > 0n && !!swapPlan && !skipSimulation },
    }
    const {
        data: simulationData,
        isLoading: isPreparing,
        error: simulationError,
    } = useSimulateContract(simulateConfig)

    const {
        data: sendHash,
        sendTransaction,
        isPending: isExecuting,
        isError,
        error,
    } = useSendTransaction()
    const { isSuccess, isPending: isReceiptPending } = useWaitForTransactionReceipt({
        hash: sendHash,
    })

    const executeSwap = () => {
        if (!swapPlan) {
            toastError('Aggregation router not available for this route')
            return
        }
        if (!simulationData?.request) {
            toastError('Swap simulation failed. Please try again.')
            return
        }
        sendTransaction({
            to: swapPlan.call.address,
            data: swapPlan.data,
            value: swapPlan.call.value,
            chainId,
        })
    }

    return {
        swap: executeSwap,
        canSwap: !!simulationData?.request,
        result: null,
        isPreparing,
        isExecuting,
        isConfirming: !!sendHash && isReceiptPending,
        isSuccess,
        isError,
        error: error as Error | null,
        hash: sendHash,
        simulationError: simulationError as Error | null,
        isWrapUnwrap: false,
    }
}
