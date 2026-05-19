'use client'

import { useSimulateContract, useWriteContract, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import {
    PUMP_CORE_NATIVE_ADDRESS,
    PUMP_CORE_NATIVE_ABI,
    PUMP_CORE_NATIVE_CHAIN_ID,
} from '@/lib/abis/pump-core-native'

interface UseGraduateParams {
    tokenAddr: Address | null
    enabled?: boolean
}

interface UseGraduateResult {
    graduate: () => void
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
}

export function useGraduate({ tokenAddr, enabled = true }: UseGraduateParams): UseGraduateResult {
    const publicClient = usePublicClient({ chainId: PUMP_CORE_NATIVE_CHAIN_ID })

    const { data: simulationData, isLoading: isPreparing } = useSimulateContract({
        address: PUMP_CORE_NATIVE_ADDRESS,
        abi: PUMP_CORE_NATIVE_ABI,
        functionName: 'graduate',
        args: tokenAddr ? [tokenAddr] : undefined,
        chainId: PUMP_CORE_NATIVE_CHAIN_ID,
        query: {
            enabled: !!tokenAddr && enabled,
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
        queryKey: ['graduate-receipt', hash],
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

    const graduate = () => {
        if (!simulationData?.request) return
        writeContract(simulationData.request)
    }

    return {
        graduate,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        isError,
        error: error as Error | null,
        hash,
    }
}
