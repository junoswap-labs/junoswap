'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import type { Address } from 'viem'
import { maxUint256, zeroAddress } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { getWrappedNativeAddress } from '@/lib/tokens'
import { shouldSkipUnwrap } from '@/lib/wagmi'

const KKUB_UNWRAPPER_ADDRESS = '0xff76DD8086428EBC4Ed1b14B0e56E95eDc46a315' as const

const KKUB_UNWRAPPER_ABI = [
    {
        type: 'function',
        name: 'withdraw',
        stateMutability: 'nonpayable',
        inputs: [{ name: '_amount', type: 'uint256' }],
        outputs: [],
    },
] as const

interface UseKkubUnwrapParams {
    chainId: number
    amount: bigint
    owner?: Address
}

interface UseKkubUnwrapResult {
    startUnwrap: () => void
    reset: () => void
    isApproving: boolean
    isConfirmingApproval: boolean
    isWithdrawing: boolean
    isConfirmingWithdraw: boolean
    isUnwrapping: boolean
    isSuccess: boolean
    isError: boolean
    unwrapHash: Address | undefined
    isSkipUnwrap: boolean
}

export function useKkubUnwrap({
    chainId,
    amount,
    owner,
}: UseKkubUnwrapParams): UseKkubUnwrapResult {
    const isSkipUnwrap = shouldSkipUnwrap(chainId)
    const kkubAddress = isSkipUnwrap ? getWrappedNativeAddress(chainId) : undefined

    const { data: allowance = 0n } = useReadContract({
        address: kkubAddress!,
        abi: getAbi('erc20'),
        functionName: 'allowance',
        args: owner ? [owner, KKUB_UNWRAPPER_ADDRESS] : ([zeroAddress, zeroAddress] as const),
        chainId,
        query: {
            enabled: isSkipUnwrap && !!owner && !!kkubAddress && amount > 0n,
        },
    })

    const { writeContract, data: hash, isPending, isError } = useWriteContract()
    const { isSuccess: isTxDone, isPending: isTxConfirming } = useWaitForTransactionReceipt({
        hash,
        chainId,
    })

    const [phase, setPhase] = useState<'idle' | 'approving' | 'withdrawing' | 'done'>('idle')
    const processedHashRef = useRef('')
    const triggeredRef = useRef(false)

    useEffect(() => {
        if (!isTxDone || !hash) return
        if (processedHashRef.current === hash) return
        processedHashRef.current = hash

        if (phase === 'approving') {
            setPhase('withdrawing')
            writeContract({
                address: KKUB_UNWRAPPER_ADDRESS,
                abi: KKUB_UNWRAPPER_ABI,
                functionName: 'withdraw',
                args: [amount],
            })
        } else if (phase === 'withdrawing') {
            setPhase('done')
        }
    }, [isTxDone, hash, phase, writeContract, amount])

    const startUnwrap = useCallback(() => {
        if (!isSkipUnwrap || !kkubAddress || !owner || triggeredRef.current || amount <= 0n) return
        triggeredRef.current = true

        if (allowance >= amount) {
            setPhase('withdrawing')
            writeContract({
                address: KKUB_UNWRAPPER_ADDRESS,
                abi: KKUB_UNWRAPPER_ABI,
                functionName: 'withdraw',
                args: [amount],
            })
        } else {
            setPhase('approving')
            writeContract({
                address: kkubAddress,
                abi: getAbi('erc20'),
                functionName: 'approve',
                args: [KKUB_UNWRAPPER_ADDRESS, maxUint256],
            })
        }
    }, [isSkipUnwrap, kkubAddress, owner, allowance, amount, writeContract])

    const reset = useCallback(() => {
        triggeredRef.current = false
        setPhase('idle')
        processedHashRef.current = ''
    }, [])

    useEffect(() => {
        triggeredRef.current = false
        setPhase('idle')
        processedHashRef.current = ''
    }, [amount])

    return {
        startUnwrap,
        reset,
        isApproving: phase === 'approving' && isPending,
        isConfirmingApproval: phase === 'approving' && !!hash && isTxConfirming,
        isWithdrawing: phase === 'withdrawing' && isPending,
        isConfirmingWithdraw: phase === 'withdrawing' && !!hash && isTxConfirming,
        isUnwrapping: phase === 'approving' || phase === 'withdrawing',
        isSuccess: phase === 'done',
        isError: (phase === 'approving' || phase === 'withdrawing') && isError,
        unwrapHash: hash,
        isSkipUnwrap,
    }
}
