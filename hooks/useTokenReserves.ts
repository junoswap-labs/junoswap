'use client'

import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getCurveState } from '@/lib/curve-state'
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from '@/hooks/useLaunchpadChainId'

interface UseTokenReservesParams {
    tokenAddr: Address | null
    isGraduated?: boolean
    chainId?: number
    /** Which curve deployment this token trades on. Defaults to the chain's primary launchpad. */
    launchpadId?: string
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
    chainId = DEFAULT_LAUNCHPAD_CHAIN_ID,
    launchpadId,
}: UseTokenReservesParams): UseTokenReservesResult {
    const client = usePublicClient({ chainId })
    const skip = !tokenAddr || !!isGraduatedProp || !client

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['curve-state', chainId, launchpadId, tokenAddr],
        queryFn: () => getCurveState(client!, { chainId, token: tokenAddr!, launchpadId }),
        enabled: !skip,
        staleTime: 0,
    })

    return {
        nativeReserve: data?.nativeReserve ?? 0n,
        tokenReserve: data?.tokenReserve ?? 0n,
        isGraduated: !!isGraduatedProp,
        virtualAmount: data?.virtualAmount ?? 0n,
        graduationAmount: data?.graduationAmount ?? 0n,
        isLoading: !!isLoading && !skip,
        refetch,
    }
}
