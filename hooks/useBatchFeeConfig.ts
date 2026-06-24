'use client'

import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import { BATCH_TRANSFER_ABI } from '@/lib/abis/batch-transfer'
import { getBatchTransferAddress, FEE_TYPE, type FeeType } from '@/lib/batch-config'

export interface FeeConfig {
    feeType: FeeType
    feeToken: Address
    feeAmount: bigint
}

export function useBatchFeeConfig(chainId: number): {
    feeConfig: FeeConfig | undefined
    isLoading: boolean
} {
    const contractAddress = getBatchTransferAddress(chainId)

    const { data, isLoading } = useReadContract({
        address: contractAddress,
        abi: BATCH_TRANSFER_ABI,
        functionName: 'feeConfig',
        chainId,
        query: { enabled: !!contractAddress },
    })

    if (!data) return { feeConfig: undefined, isLoading }

    const [feeType, feeToken, feeAmount] = data
    return {
        feeConfig: {
            feeType: feeType as FeeType,
            feeToken,
            feeAmount,
        },
        isLoading,
    }
}

export function calcFee(feeConfig: FeeConfig | undefined, recipientCount: number): bigint {
    if (!feeConfig || feeConfig.feeType === FEE_TYPE.NONE) return 0n
    if (feeConfig.feeType === FEE_TYPE.PER_TX) return feeConfig.feeAmount
    return feeConfig.feeAmount * BigInt(recipientCount)
}

export function isFeeNative(feeConfig: FeeConfig | undefined): boolean {
    return !feeConfig || feeConfig.feeToken === '0x0000000000000000000000000000000000000000'
}
