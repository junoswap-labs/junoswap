'use client'

import { useMemo } from 'react'
import {
    useAccount,
    useReadContract,
    useSimulateContract,
    useWriteContract,
    usePublicClient,
    type UseSimulateContractParameters,
} from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { zeroAddress, type Address } from 'viem'
import { getAbi, computeCurve, planCurveCall } from '@coshi190/juno-moneta-sdk'
import { getAllowanceFunctionName } from '@/lib/tokens'
import { useLaunchpadContract } from '@/hooks/useLaunchpadChainId'
import { calculateMinOutput } from '@/services/dex/slippage'
import { useSwapStore } from '@/store/swap-store'

interface UseBondingCurveSwapExecutionParams {
    side: 'buy' | 'sell'
    tokenAddr: Address | null
    amount: bigint
    nativeReserve: bigint
    tokenReserve: bigint
    virtualAmount: bigint
    /** Which curve deployment this token trades on. Defaults to the chain's primary launchpad. */
    launchpadId?: string
    enabled?: boolean
}

interface UseBondingCurveSwapExecutionResult {
    execute: () => void
    canExecute: boolean
    expectedOut: bigint
    minOut: bigint
    isPreparing: boolean
    isExecuting: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
}

export function useBondingCurveSwapExecution({
    side,
    tokenAddr,
    amount,
    nativeReserve,
    tokenReserve,
    virtualAmount,
    launchpadId,
    enabled = true,
}: UseBondingCurveSwapExecutionParams): UseBondingCurveSwapExecutionResult {
    const isBuy = side === 'buy'
    const { settings } = useSwapStore()
    const slippageBps = Math.round(settings.slippage * 100)
    const { address } = useAccount()
    const {
        chainId,
        address: bondingCurveAddress,
        launchpadId: resolvedLaunchpadId,
    } = useLaunchpadContract(launchpadId)
    const publicClient = usePublicClient({ chainId })

    const { data: allowance = 0n } = useReadContract({
        address: tokenAddr ?? undefined,
        abi: getAbi('kap20'),
        functionName: tokenAddr ? getAllowanceFunctionName(tokenAddr) : 'allowance',
        args: [address ?? zeroAddress, bondingCurveAddress ?? zeroAddress],
        chainId,
        query: { enabled: !isBuy && !!tokenAddr && !!address && !!bondingCurveAddress },
    })

    const expectedOut = useMemo(() => {
        const { buyOutput, sellOutput } = computeCurve({
            nativeReserve,
            tokenReserve,
            virtualAmount,
            buyAmountIn: isBuy ? amount : 0n,
            sellAmountIn: isBuy ? 0n : amount,
        })
        return isBuy ? buyOutput : sellOutput
    }, [isBuy, amount, nativeReserve, tokenReserve, virtualAmount])

    const minOut = useMemo(
        () => calculateMinOutput(expectedOut, slippageBps),
        [expectedOut, slippageBps]
    )

    const call = useMemo(() => {
        if (!tokenAddr || !bondingCurveAddress) return null
        return planCurveCall(
            chainId,
            isBuy
                ? { kind: 'buy', token: tokenAddr, minOut, value: amount }
                : { kind: 'sell', token: tokenAddr, amountIn: amount, minOut },
            resolvedLaunchpadId
        )
    }, [chainId, isBuy, tokenAddr, bondingCurveAddress, amount, minOut, resolvedLaunchpadId])

    const simulateConfig: UseSimulateContractParameters = {
        address: call?.address,
        abi: call?.abi,
        functionName: call?.functionName,
        args: call?.args,
        value: call?.value,
        chainId,
        query: {
            enabled: !!call && amount > 0n && (isBuy || allowance >= amount) && enabled,
        },
    }
    const { data: simulationData, isLoading: isPreparing } = useSimulateContract(simulateConfig)

    const {
        data: hash,
        writeContract,
        isPending: isExecuting,
        isError: isWriteError,
        error: writeError,
    } = useWriteContract()

    const { data: receipt } = useQuery({
        queryKey: [`${side}-receipt`, hash],
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

    const canExecute = !!simulationData?.request

    const execute = () => {
        if (!simulationData?.request) return
        writeContract(simulationData.request)
    }

    return {
        execute,
        canExecute,
        expectedOut,
        minOut,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        isError,
        error: error as Error | null,
        hash,
    }
}
