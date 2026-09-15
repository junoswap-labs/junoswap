'use client'

import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import { isValidTokenAddress } from '@/lib/tokens'
interface UseTokenMetadataResult {
    token: Token | null
    isLoading: boolean
    isError: boolean
}

export function useTokenMetadata(
    address: string | undefined,
    chainId: number
): UseTokenMetadataResult {
    const enabled = isValidTokenAddress(address ?? '')
    const tokenAddress = address as Address

    const { data, isLoading, isError } = useReadContracts({
        contracts: [
            { address: tokenAddress, abi: getAbi('erc20'), functionName: 'symbol', chainId },
            { address: tokenAddress, abi: getAbi('erc20'), functionName: 'name', chainId },
            { address: tokenAddress, abi: getAbi('erc20'), functionName: 'decimals', chainId },
        ],
        query: { enabled },
    })

    if (!enabled || isLoading || isError || !data) {
        return { token: null, isLoading: enabled && isLoading, isError: enabled && isError }
    }

    const [symbolResult, nameResult, decimalsResult] = data

    if (symbolResult.status !== 'success' || decimalsResult.status !== 'success') {
        return { token: null, isLoading: false, isError: true }
    }

    const token: Token = {
        address: tokenAddress,
        symbol: (symbolResult.result as string) || '???',
        name: nameResult.status === 'success' ? (nameResult.result as string) || '' : '',
        decimals: Number(decimalsResult.result),
        chainId,
    }

    return { token, isLoading: false, isError: false }
}
