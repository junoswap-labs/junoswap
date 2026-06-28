'use client'

import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import {
    BONDING_CURVE_JUNOSWAP_ABI,
    BONDING_CURVE_JUNOSWAP_CHAIN_ID,
    getBondingCurveAddress,
} from '@/lib/abis/bonding-curve-junoswap'

// Virtual amount is constant in the contract (3400 ether) — safe to hardcode.
// graduationAmount is mutable via setCurveState(), so we read it from chain.
const VIRTUAL_AMOUNT = 3400n * 10n ** 18n

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
    chainId = BONDING_CURVE_JUNOSWAP_CHAIN_ID,
}: UseTokenReservesParams): UseTokenReservesResult {
    const bondingCurveAddress = getBondingCurveAddress(chainId)
    // For graduated tokens, reserves are not meaningful (liquidity is in V3 pool)
    const skip = !tokenAddr || !!isGraduatedProp || !bondingCurveAddress
    const reserveArgs: [`0x${string}`] | undefined =
        tokenAddr && !isGraduatedProp ? [tokenAddr] : undefined

    // Batch pumpReserve + graduationAmount into a single multicall. graduationAmount
    // is a storage variable set by feeCollector via setCurveState() — it is NOT
    // constant and must be read live, otherwise the UI's "ready" threshold can
    // disagree with the contract's `not reach graduation cap` check.
    const { data, isLoading, refetch } = useReadContracts({
        contracts: [
            {
                address: bondingCurveAddress,
                abi: BONDING_CURVE_JUNOSWAP_ABI,
                functionName: 'pumpReserve',
                args: reserveArgs,
                chainId,
            },
            {
                address: bondingCurveAddress,
                abi: BONDING_CURVE_JUNOSWAP_ABI,
                functionName: 'graduationAmount',
                chainId,
            },
        ],
        query: {
            enabled: !skip,
        },
    })

    const reserveData = data?.[0]?.result as [bigint, bigint] | undefined
    const graduationAmountData = data?.[1]?.result as bigint | undefined

    return {
        nativeReserve: reserveData?.[0] ?? 0n,
        tokenReserve: reserveData?.[1] ?? 0n,
        isGraduated: !!isGraduatedProp,
        virtualAmount: VIRTUAL_AMOUNT,
        // Default to 0n while loading so isReadyToGraduate returns false until the
        // on-chain value resolves — prevents flashing a "ready" state with the
        // stale hardcoded cap.
        graduationAmount: graduationAmountData ?? 0n,
        isLoading: !!isLoading && !skip,
        refetch,
    }
}
