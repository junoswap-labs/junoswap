'use client'

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import type { Address } from 'viem'
import { BATCH_TRANSFER_ABI } from '@/lib/abis/batch-transfer'
import { getBatchTransferAddress } from '@/lib/batch-config'
import type { FeeConfig } from './useBatchFeeConfig'
import { calcFee, isFeeNative } from './useBatchFeeConfig'

export interface Recipient {
    address: Address
    amount: bigint
}

function isEqualAmounts(recipients: Recipient[]): boolean {
    if (recipients.length === 0) return true
    const first = recipients[0]?.amount
    return recipients.every((r) => r.amount === first)
}

export function useMultiSendTransfer(chainId: number) {
    const contractAddress = getBatchTransferAddress(chainId)

    const {
        data: hash,
        writeContract,
        isPending: isWritePending,
        isError,
        error,
        reset,
    } = useWriteContract()

    const { isSuccess, isPending: receiptPending } = useWaitForTransactionReceipt({ hash, chainId })
    const isConfirming = !!hash && receiptPending

    function sendNative(recipients: Recipient[], feeConfig: FeeConfig | undefined) {
        if (!contractAddress) return
        const fee = calcFee(feeConfig, recipients.length)
        const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0n)
        const value = isFeeNative(feeConfig) ? totalAmount + fee : totalAmount

        if (isEqualAmounts(recipients)) {
            writeContract({
                address: contractAddress,
                abi: BATCH_TRANSFER_ABI,
                functionName: 'batchTransferNativeEqual',
                args: [recipients.map((r) => r.address), recipients[0]?.amount ?? 0n],
                value,
                chainId,
            })
        } else {
            writeContract({
                address: contractAddress,
                abi: BATCH_TRANSFER_ABI,
                functionName: 'batchTransferNative',
                args: [recipients.map((r) => r.address), recipients.map((r) => r.amount)],
                value,
                chainId,
            })
        }
    }

    function sendERC20(token: Address, recipients: Recipient[], feeConfig: FeeConfig | undefined) {
        if (!contractAddress) return
        const fee = calcFee(feeConfig, recipients.length)
        const value = isFeeNative(feeConfig) ? fee : 0n

        if (isEqualAmounts(recipients)) {
            writeContract({
                address: contractAddress,
                abi: BATCH_TRANSFER_ABI,
                functionName: 'batchTransferERC20Equal',
                args: [token, recipients.map((r) => r.address), recipients[0]?.amount ?? 0n],
                value,
                chainId,
            })
        } else {
            writeContract({
                address: contractAddress,
                abi: BATCH_TRANSFER_ABI,
                functionName: 'batchTransferERC20',
                args: [token, recipients.map((r) => r.address), recipients.map((r) => r.amount)],
                value,
                chainId,
            })
        }
    }

    return {
        sendNative,
        sendERC20,
        hash,
        isWritePending,
        isConfirming,
        isSuccess,
        isError,
        error,
        reset,
    }
}
