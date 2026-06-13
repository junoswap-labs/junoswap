'use client'

import { useCallback } from 'react'
import { useWriteContract, useSimulateContract, useSendTransaction, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { isNativeToken } from '@/lib/wagmi'
import { parseTokenAmount } from '@/services/tokens'
import { toastError } from '@/lib/toast'

// Stable reference so error effects don't re-fire on every render.
const REVERT_ERROR = new Error('Transaction reverted')

interface UseSendTokenParams {
    token: Token | null
    recipient: Address | null
    amount: string // human-readable amount, e.g. "1.5"
}

interface UseSendTokenResult {
    send: () => void
    isPreparing: boolean
    isExecuting: boolean // wallet pending
    isConfirming: boolean // on-chain pending
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
    reset: () => void
}

/**
 * Sends either an ERC20 `transfer(to, amount)` or a native coin transfer.
 *
 * The receipt is polled manually via `publicClient.getTransactionReceipt`
 * (matching useCreateToken). useWaitForTransactionReceipt is unreliable on
 * these — especially KUB — RPCs and would hang at "Confirming…" forever.
 */
export function useSendToken({ token, recipient, amount }: UseSendTokenParams): UseSendTokenResult {
    const isNative = token ? isNativeToken(token.address) : false
    const rawAmount = token && amount ? parseTokenAmount(amount, token.decimals) : 0n
    const publicClient = usePublicClient()

    // ERC20 path: simulate then write transfer(to, amount)
    const { data: simulationData, isLoading: isPreparing } = useSimulateContract({
        address: token?.address as Address,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient || '0x0', rawAmount],
        chainId: token?.chainId,
        query: {
            enabled: !!token && !isNative && !!recipient && rawAmount > 0n,
        },
    })
    const {
        data: writeHash,
        writeContract,
        isPending: isErc20Executing,
        isError: isErc20Error,
        error: erc20Error,
        reset: resetWrite,
    } = useWriteContract()

    // Native path: plain value transfer (no contract to simulate)
    const {
        data: nativeHash,
        sendTransaction,
        isPending: isNativeExecuting,
        isError: isNativeError,
        error: nativeError,
        reset: resetSend,
    } = useSendTransaction()

    const hash = (isNative ? nativeHash : writeHash) as Address | undefined

    // Poll the receipt on the active chain every 2s; stop once it's found.
    const { data: receipt } = useQuery({
        queryKey: ['send-token-receipt', hash],
        queryFn: async () => {
            if (!hash || !publicClient) return null
            return publicClient.getTransactionReceipt({ hash })
        },
        enabled: !!hash && !!publicClient,
        refetchInterval: (query) => (query.state.data ? false : 2000),
    })

    const isConfirming = !!hash && !receipt
    const isSuccess = !!receipt && receipt.status === 'success'
    const isReverted = !!receipt && receipt.status === 'reverted'

    const send = useCallback(() => {
        if (!token || !recipient) return
        const value = parseTokenAmount(amount, token.decimals)
        if (value <= 0n) return

        if (isNative) {
            sendTransaction({ to: recipient, value })
        } else {
            if (!simulationData?.request) {
                toastError('Transfer simulation failed. Please try again.')
                return
            }
            writeContract({ ...simulationData.request })
        }
    }, [token, recipient, amount, isNative, sendTransaction, simulationData, writeContract])

    const reset = useCallback(() => {
        resetWrite()
        resetSend()
    }, [resetWrite, resetSend])

    const writeIsError = isNative ? isNativeError : isErc20Error
    const writeError = (isNative ? nativeError : erc20Error) as Error | null

    return {
        send,
        isPreparing: isNative ? false : isPreparing,
        isExecuting: isNative ? isNativeExecuting : isErc20Executing,
        isConfirming,
        isSuccess,
        isError: !!writeIsError || isReverted,
        error: writeError ?? (isReverted ? REVERT_ERROR : null),
        hash,
        reset,
    }
}
