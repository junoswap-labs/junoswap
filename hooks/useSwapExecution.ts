'use client'

import { useMemo } from 'react'
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useSimulateContract,
    useSendTransaction,
    type UseSimulateContractParameters,
} from 'wagmi'
import type { Address } from 'viem'
import { planSwap } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import type { DEXType } from '@/lib/dex-meta'
import type { SwapResult } from '@/types/swap'
import type { Protocol, SwapRoute } from '@/types/routing'
import { useSwapStore } from '@/store/swap-store'
import { toastError } from '@/lib/toast'
import { useReferrer } from '@/hooks/useReferrer'

interface UseSwapExecutionParams {
    protocol: Protocol
    tokenIn: Token
    tokenOut: Token
    amountIn: bigint
    amountOutMinimum: bigint
    recipient: Address
    deadlineMinutes: number
    fee?: number
    route?: SwapRoute
    dexId?: DEXType
    forceUnwrapNative?: boolean
    skipSimulation?: boolean
}

interface UseSwapExecutionResult {
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

export function useSwapExecution({
    protocol,
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMinimum,
    recipient,
    deadlineMinutes,
    fee,
    route,
    dexId,
    forceUnwrapNative,
    skipSimulation = false,
}: UseSwapExecutionParams): UseSwapExecutionResult {
    const { selectedDex } = useSwapStore()
    const referrer = useReferrer()
    const activeDex = dexId ?? selectedDex
    const chainId = tokenIn.chainId

    const plan = useMemo<ReturnType<typeof planSwap> | null>(() => {
        if (amountIn <= 0n) return null
        const isMultiHop = !!route?.isMultiHop && route.path.length > 2
        try {
            return planSwap({
                protocol,
                chainId,
                dexId: activeDex,
                tokenIn: tokenIn.address as Address,
                tokenOut: tokenOut.address as Address,
                amountIn,
                amountOutMin: amountOutMinimum,
                recipient,
                deadline: Math.floor(Date.now() / 1000) + deadlineMinutes * 60,
                path: isMultiHop ? route!.path : undefined,
                fees: isMultiHop ? route!.fees : undefined,
                fee,
                forceUnwrapNative,
                referrer,
            })
        } catch {
            // No config for this dex/chain — surfaced as a toast on submit.
            return null
        }
    }, [
        protocol,
        chainId,
        activeDex,
        tokenIn.address,
        tokenOut.address,
        amountIn,
        amountOutMinimum,
        recipient,
        deadlineMinutes,
        fee,
        route,
        forceUnwrapNative,
        referrer,
    ])

    const simulateConfig: UseSimulateContractParameters = {
        address: plan?.call.address,
        abi: plan?.call.abi,
        functionName: plan?.call.functionName,
        args: plan?.call.args,
        value: plan?.call.value,
        chainId,
        query: { enabled: !!plan && !skipSimulation },
    }
    const {
        data: simulationData,
        isLoading: isPreparing,
        error: simulationError,
    } = useSimulateContract(simulateConfig)

    const shouldTag = plan?.taggable ?? false
    const {
        data: writeHash,
        writeContract: write,
        isPending: isWriting,
        isError: isWriteError,
        error: writeError,
    } = useWriteContract()
    const {
        data: sendHash,
        sendTransaction,
        isPending: isSending,
        isError: isSendError,
        error: sendError,
    } = useSendTransaction()

    const hash = shouldTag ? sendHash : writeHash
    const isExecuting = shouldTag ? isSending : isWriting
    const isError = shouldTag ? isSendError : isWriteError
    const error = shouldTag ? sendError : writeError

    const { isSuccess, isPending: isReceiptPending } = useWaitForTransactionReceipt({ hash })

    const executeSwap = () => {
        if (!plan) {
            toastError('DEX config not found for this chain')
            return
        }
        if (!simulationData?.request) {
            toastError('Swap simulation failed. Please try again.')
            return
        }
        if (plan.taggable) {
            sendTransaction({
                to: plan.call.address,
                data: plan.data,
                value: plan.call.value,
                chainId,
            })
            return
        }
        write(simulationData.request)
    }

    return {
        swap: executeSwap,
        canSwap: !!simulationData?.request,
        result: null,
        isPreparing,
        isExecuting,
        isConfirming: !!hash && isReceiptPending,
        isSuccess,
        isError,
        error: error as Error | null,
        hash,
        simulationError: simulationError as Error | null,
        isWrapUnwrap: plan?.kind === 'wrap' || plan?.kind === 'unwrap',
    }
}
