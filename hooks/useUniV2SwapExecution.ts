'use client'

import { useMemo } from 'react'
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useSimulateContract,
    useSendTransaction,
} from 'wagmi'
import { encodeFunctionData, type Address } from 'viem'
import type { Token } from '@/types/tokens'
import type { SwapResult } from '@/types/swap'
import { getV2Config } from '@/lib/dex-config'
import { useSwapStore } from '@/store/swap-store'
import { UNISWAP_V2_ROUTER_ABI } from '@/lib/abis/uniswap-v2-router'
import { buildV2SwapParams, buildV2MultiHopSwapParams } from '@/services/dex/uniswap-v2'
import type { SwapRoute } from '@/types/routing'
import { toastError } from '@/lib/toast'
import { isNativeToken, shouldSkipUnwrap } from '@/lib/wagmi'
import { getWrapOperation, getWrappedNativeAddress } from '@/services/tokens'
import { WETH9_ABI } from '@/lib/abis/weth9'
import { useReferrer } from '@/hooks/useReferrer'
import { appendTrackingTag } from '@/lib/swap-tracking'

interface UseUniV2SwapExecutionParams {
    tokenIn: Token
    tokenOut: Token
    amountIn: bigint
    amountOutMinimum: bigint
    recipient: Address
    deadlineMinutes: number
    route?: SwapRoute
    skipSimulation?: boolean // Skip simulation during approval phase
}

interface UseUniV2SwapExecutionResult {
    swap: () => void
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

export function useUniV2SwapExecution({
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMinimum,
    recipient,
    deadlineMinutes,
    route,
    skipSimulation = false,
}: UseUniV2SwapExecutionParams): UseUniV2SwapExecutionResult {
    const { selectedDex } = useSwapStore()
    const referrer = useReferrer()
    const dexConfig = getV2Config(tokenIn.chainId, selectedDex)
    const wrapOperation = useMemo(() => {
        return getWrapOperation(tokenIn, tokenOut)
    }, [tokenIn, tokenOut])
    const isNativeInput = isNativeToken(tokenIn.address as Address)
    const isNativeOutput = isNativeToken(tokenOut.address as Address)
    const skipUnwrap = isNativeOutput && shouldSkipUnwrap(tokenIn.chainId)
    const swapParams = useMemo(() => {
        if (route?.isMultiHop && route.path.length > 2) {
            return buildV2MultiHopSwapParams(
                {
                    path: route.path,
                    amountIn,
                    amountOutMinimum,
                    recipient,
                    deadline: Math.floor(Date.now() / 1000) + deadlineMinutes * 60,
                },
                tokenIn.chainId,
                dexConfig?.wnative
            )
        }
        return buildV2SwapParams(
            {
                tokenIn: tokenIn.address as Address,
                tokenOut: tokenOut.address as Address,
                amountIn,
                amountOutMinimum,
                recipient,
                deadline: Math.floor(Date.now() / 1000) + deadlineMinutes * 60,
            },
            tokenIn.chainId,
            dexConfig?.wnative
        )
    }, [
        route,
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMinimum,
        recipient,
        deadlineMinutes,
        dexConfig,
    ])
    const contractCall = useMemo(() => {
        if (wrapOperation) {
            const wrappedAddress = getWrappedNativeAddress(tokenIn.chainId)
            if (wrapOperation === 'wrap') {
                return {
                    address: wrappedAddress,
                    abi: WETH9_ABI,
                    functionName: 'deposit' as const,
                    args: [] as const,
                    value: amountIn,
                }
            } else {
                return {
                    address: wrappedAddress,
                    abi: WETH9_ABI,
                    functionName: 'withdraw' as const,
                    args: [amountIn] as [bigint],
                    value: undefined,
                }
            }
        }
        if (isNativeInput) {
            return {
                functionName: 'swapExactETHForTokens' as const,
                args: [
                    swapParams.amountOutMin,
                    swapParams.path,
                    swapParams.to,
                    swapParams.deadline,
                ] as const,
                value: amountIn,
            }
        } else if (isNativeOutput && !skipUnwrap) {
            return {
                functionName: 'swapExactTokensForETH' as const,
                args: [
                    swapParams.amountIn,
                    swapParams.amountOutMin,
                    swapParams.path,
                    swapParams.to,
                    swapParams.deadline,
                ] as const,
                value: undefined,
            }
        } else {
            return {
                functionName: 'swapExactTokensForTokens' as const,
                args: [
                    swapParams.amountIn,
                    swapParams.amountOutMin,
                    swapParams.path,
                    swapParams.to,
                    swapParams.deadline,
                ] as const,
                value: undefined,
            }
        }
    }, [
        wrapOperation,
        tokenIn,
        tokenOut,
        amountIn,
        swapParams,
        isNativeInput,
        isNativeOutput,
        skipUnwrap,
        skipSimulation,
    ])
    const {
        data: simulationData,
        isLoading: isPreparing,
        error: simulationError,
    } = useSimulateContract(
        (wrapOperation
            ? {
                  address: (contractCall as { address: Address }).address,
                  abi: WETH9_ABI,
                  functionName:
                      wrapOperation === 'wrap' ? ('deposit' as const) : ('withdraw' as const),
                  args: wrapOperation === 'wrap' ? ([] as const) : ([amountIn] as const),
                  value: wrapOperation === 'wrap' ? amountIn : undefined,
                  chainId: tokenIn.chainId,
                  query: {
                      enabled: amountIn > 0n && !skipSimulation,
                  },
              }
            : {
                  address: dexConfig?.router,
                  abi: UNISWAP_V2_ROUTER_ABI,
                  functionName: contractCall.functionName,
                  args: contractCall.args,
                  value: contractCall.value,
                  chainId: tokenIn.chainId,
                  query: {
                      enabled: amountIn > 0n && !!dexConfig && !skipSimulation,
                  },
              }) as any // eslint-disable-line @typescript-eslint/no-explicit-any -- complex conditional type union
    )
    // Every router swap (including Junoswap's own) carries a tracking suffix appended
    // to the calldata, which requires a raw sendTransaction — writeContract re-encodes
    // from abi/args and would drop the suffix. Wrap/unwrap is not a swap, so it stays on
    // the simulated writeContract path and is left untagged.
    const shouldTag = !wrapOperation
    const {
        data: writeHash,
        writeContract: swap,
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
    const { isSuccess, isPending: isConfirming } = useWaitForTransactionReceipt({
        hash,
    })
    const executeSwap = () => {
        if (!dexConfig && !wrapOperation) {
            toastError('jibswap config not found for this chain')
            return
        }
        if (!simulationData?.request) {
            toastError('Swap simulation failed. Please try again.')
            return
        }
        if (shouldTag && dexConfig) {
            const data = appendTrackingTag(
                encodeFunctionData({
                    abi: UNISWAP_V2_ROUTER_ABI,
                    functionName: contractCall.functionName,
                    args: contractCall.args,
                    // shouldTag implies !wrapOperation, so functionName is always a
                    // router method here, but the contractCall union still includes
                    // the wrap ops — erase the param type rather than narrow.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any),
                referrer
            )
            sendTransaction({
                to: dexConfig.router,
                data,
                value: contractCall.value,
                chainId: tokenIn.chainId,
            })
            return
        }
        swap({
            ...simulationData.request,
        })
    }
    return {
        swap: executeSwap,
        result: null,
        isPreparing,
        isExecuting,
        isConfirming,
        isSuccess,
        isError,
        error: error as Error | null,
        hash,
        simulationError: simulationError as Error | null,
        isWrapUnwrap: !!wrapOperation,
    }
}
