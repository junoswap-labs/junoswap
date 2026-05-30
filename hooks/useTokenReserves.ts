'use client'

import { useReadContract } from 'wagmi'
import type { Address } from 'viem'
import {
    PUMP_CORE_NATIVE_ADDRESS,
    PUMP_CORE_NATIVE_ABI,
    PUMP_CORE_NATIVE_CHAIN_ID,
} from '@/lib/abis/pump-core-native'

// Contract constants — match PumpCoreNative values (never change)
const VIRTUAL_AMOUNT = 3400n * 10n ** 18n
const GRADUATION_AMOUNT = 150n * 10n ** 18n

interface UseTokenReservesParams {
    tokenAddr: Address | null
    isGraduated?: boolean
    chainId?: number
}

interface UseTokenReservesResult {
    nativeReserve: bigint
    tokenReserve: bigint
    isGraduated: boolean
    virtualAmount: bigint
    graduationAmount: bigint
    isLoading: boolean
    refetch: () => void
}

export function useTokenReserves({
    tokenAddr,
    isGraduated: isGraduatedProp,
    chainId = PUMP_CORE_NATIVE_CHAIN_ID,
}: UseTokenReservesParams): UseTokenReservesResult {
    // For graduated tokens, reserves are not meaningful (liquidity is in V3 pool)
    const skip = !tokenAddr || !!isGraduatedProp

    const {
        data: reserveData,
        isLoading: isLoadingReserve,
        refetch,
    } = useReadContract({
        address: PUMP_CORE_NATIVE_ADDRESS,
        abi: PUMP_CORE_NATIVE_ABI,
        functionName: 'pumpReserve',
        args: tokenAddr && !isGraduatedProp ? [tokenAddr] : undefined,
        chainId,
        query: {
            enabled: !skip,
        },
    })

    const reserve = reserveData as [bigint, bigint] | undefined

    return {
        nativeReserve: reserve?.[0] ?? 0n,
        tokenReserve: reserve?.[1] ?? 0n,
        isGraduated: !!isGraduatedProp,
        virtualAmount: VIRTUAL_AMOUNT,
        graduationAmount: GRADUATION_AMOUNT,
        isLoading: isLoadingReserve && !skip,
        refetch,
    }
}
