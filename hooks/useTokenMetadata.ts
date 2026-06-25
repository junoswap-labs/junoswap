'use client'

import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { isValidTokenAddress } from '@/services/tokens'
import type { Token } from '@/types/tokens'

interface UseTokenMetadataResult {
    token: Token | null
    isLoading: boolean
    isError: boolean
}

/**
 * Reads ERC-20 metadata (symbol/name/decimals) for an arbitrary address so an
 * unlisted token can be imported. Latest-block reads only — safe on the KUB RPC
 * (the archive-node caveat in CLAUDE.md is about historical reads).
 */
export function useTokenMetadata(
    address: string | undefined,
    chainId: number
): UseTokenMetadataResult {
    const enabled = isValidTokenAddress(address ?? '')
    const tokenAddress = address as Address

    const { data, isLoading, isError } = useReadContracts({
        contracts: [
            { address: tokenAddress, abi: ERC20_ABI, functionName: 'symbol', chainId },
            { address: tokenAddress, abi: ERC20_ABI, functionName: 'name', chainId },
            { address: tokenAddress, abi: ERC20_ABI, functionName: 'decimals', chainId },
        ],
        query: { enabled },
    })

    if (!enabled || isLoading || isError || !data) {
        return { token: null, isLoading: enabled && isLoading, isError: enabled && isError }
    }

    const [symbolResult, nameResult, decimalsResult] = data

    // symbol and decimals are required to treat this as a usable ERC-20
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
