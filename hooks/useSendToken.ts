'use client'

import { useCallback } from 'react'
import { useWriteContract, useSimulateContract, useSendTransaction, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { zeroAddress, type Address } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import { isNativeToken } from '@/lib/wagmi'
import { parseTokenAmount } from '@/lib/tokens'
import { toastError } from '@/lib/toast'

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

export function useSendToken({ token, recipient, amount }: UseSendTokenParams): UseSendTokenResult {
    const isNative = token ? isNativeToken(token.address) : false
    const rawAmount = token && amount ? parseTokenAmount(amount, token.decimals) : 0n
    const publicClient = usePublicClient()

    const { data: simulationData, isLoading: isPreparing } = useSimulateContract({
        address: token?.address as Address,
        abi: getAbi('erc20'),
        functionName: 'transfer',
        args: [recipient ?? zeroAddress, rawAmount],
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

    const {
        data: nativeHash,
        sendTransaction,
        isPending: isNativeExecuting,
        isError: isNativeError,
        error: nativeError,
        reset: resetSend,
    } = useSendTransaction()

    const hash = (isNative ? nativeHash : writeHash) as Address | undefined

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
