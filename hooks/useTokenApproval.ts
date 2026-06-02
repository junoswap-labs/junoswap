'use client'

import { useEffect, useState, useCallback } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import { buildInfiniteApprovalParams, needsApproval } from '@/services/tokens'
import { getDexConfig, getProtocolSpender } from '@/lib/dex-config'
import { useSwapStore } from '@/store/swap-store'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { isNativeToken } from '@/lib/wagmi'
import { getAllowanceFunctionName } from '@/lib/tokens'

interface UseTokenApprovalParams {
    token: Token | null
    owner?: Address
    spender?: Address
    amountToApprove?: bigint
}

interface UseTokenApprovalResult {
    allowance: bigint
    needsApproval: boolean
    isApproving: boolean
    isConfirming: boolean
    isSuccess: boolean
    isError: boolean
    error: Error | null
    hash: Address | undefined
    approve: () => void
}

export function useTokenApproval({
    token,
    owner,
    spender: spenderOverride,
    amountToApprove,
}: UseTokenApprovalParams): UseTokenApprovalResult {
    const { selectedDex } = useSwapStore()
    const dexConfig = token ? getDexConfig(token.chainId, selectedDex) : undefined
    const defaultSpender = dexConfig ? getProtocolSpender(dexConfig) : undefined
    const spender = spenderOverride || defaultSpender
    const isTokenNative = token ? isNativeToken(token.address) : false
    const { data: allowance = 0n, refetch: refetchAllowance } = useReadContract({
        address: token?.address as Address,
        abi: ERC20_ABI,
        functionName: token ? getAllowanceFunctionName(token.address) : 'allowance',
        args: [owner || '0x0', spender || '0x0'],
        chainId: token?.chainId,
        query: {
            enabled: !!token && !!owner && !!spender && !isTokenNative,
        },
    })
    const {
        data: hash,
        writeContract: approve,
        isPending: isApproving,
        isError,
        error,
        reset,
    } = useWriteContract()
    const { isSuccess: receiptSuccess, isPending: receiptPending } = useWaitForTransactionReceipt({
        hash,
        chainId: token?.chainId,
    })
    const [approvalDetected, setApprovalDetected] = useState(false)
    const isSuccess = receiptSuccess || approvalDetected
    const isConfirming = !!hash && receiptPending && !approvalDetected
    useEffect(() => {
        if (!hash) {
            setApprovalDetected(false)
        }
    }, [hash])
    useEffect(() => {
        if (!isConfirming || !amountToApprove) return
        const pollInterval = setInterval(() => {
            refetchAllowance().then((result) => {
                if (result.data && result.data >= amountToApprove) {
                    setApprovalDetected(true)
                    reset()
                }
            })
        }, 2000) // Poll every 2 seconds
        return () => clearInterval(pollInterval)
    }, [isConfirming, amountToApprove, refetchAllowance, reset])
    useEffect(() => {
        if (receiptSuccess) {
            refetchAllowance().then(() => {
                reset()
            })
        }
    }, [receiptSuccess, refetchAllowance, reset])
    const needsToApprove =
        token && !isTokenNative && amountToApprove
            ? needsApproval(allowance, amountToApprove)
            : false
    const handleApprove = useCallback(() => {
        if (!token || !spender || !owner || isTokenNative) return
        setApprovalDetected(false)
        approve({
            ...buildInfiniteApprovalParams(token.address as Address, spender),
            chainId: token.chainId,
        })
    }, [token, spender, owner, isTokenNative, approve])
    return {
        allowance,
        needsApproval: needsToApprove,
        isApproving,
        isConfirming,
        isSuccess,
        isError,
        error,
        hash,
        approve: handleApprove,
    }
}
