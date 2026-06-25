'use client'

import { useBalance, useReadContract, useReadContracts, useAccount } from 'wagmi'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import { formatTokenAmount } from '@/services/tokens'
import { isNativeToken } from '@/lib/wagmi'
import { ERC20_ABI } from '@/lib/abis/erc20'

interface UseTokenBalanceParams {
    token: Token | null
    address?: Address
}

interface UseTokenBalanceResult {
    balance: bigint
    formattedBalance: string
    isLoading: boolean
    isError: boolean
    refetch: () => void
}

export function useTokenBalance({ token, address }: UseTokenBalanceParams): UseTokenBalanceResult {
    const isNative = token ? isNativeToken(token.address) : false
    const nativeBalance = useBalance({
        address,
        chainId: token?.chainId,
        query: {
            enabled: !!address && !!token && isNative,
        },
    })
    const erc20Balance = useReadContract({
        address: token?.address as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address || '0x0'],
        chainId: token?.chainId,
        query: {
            enabled: !!address && !!token && !isNative,
        },
    })
    const balance = isNative
        ? nativeBalance.data?.value || 0n
        : (erc20Balance.data as bigint | undefined) || 0n
    const formattedBalance = token ? formatTokenAmount(balance, token.decimals) : '0'
    return {
        balance,
        formattedBalance,
        isLoading: nativeBalance.isLoading || erc20Balance.isLoading,
        isError: nativeBalance.isError || erc20Balance.isError,
        refetch: isNative ? nativeBalance.refetch : erc20Balance.refetch,
    }
}

interface UseTokenBalancesParams {
    tokens: Token[]
    limit?: number
}

interface UseTokenBalancesResult {
    balances: Record<string, string>
    rawBalances: Record<string, bigint>
    isLoading: boolean
}

export function useTokenBalances({
    tokens,
    limit = 10,
}: UseTokenBalancesParams): UseTokenBalancesResult {
    const { address } = useAccount()
    const tokensToFetch = tokens.slice(0, limit)
    const nativeToken = tokensToFetch.find((t) => isNativeToken(t.address))
    const erc20Tokens = tokensToFetch.filter((t) => !isNativeToken(t.address))
    const nativeBalance = useBalance({
        address,
        chainId: nativeToken?.chainId,
        query: {
            enabled: !!nativeToken && !!address,
        },
    })
    const erc20Balances = useReadContracts({
        contracts: erc20Tokens.map((token) => ({
            address: token.address as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as Address],
            chainId: token.chainId,
        })),
        query: {
            enabled: erc20Tokens.length > 0 && !!address,
        },
    })
    const balances: Record<string, string> = {}
    const rawBalances: Record<string, bigint> = {}
    if (nativeToken && nativeBalance.data?.value !== undefined) {
        const key = nativeToken.address.toLowerCase()
        rawBalances[key] = nativeBalance.data.value
        balances[key] = formatTokenAmount(nativeBalance.data.value, nativeToken.decimals)
    }
    erc20Tokens.forEach((token, index) => {
        const result = erc20Balances.data?.[index]
        const balance = result?.result as bigint | undefined
        if (balance !== undefined && typeof balance === 'bigint') {
            const key = token.address.toLowerCase()
            rawBalances[key] = balance
            balances[key] = formatTokenAmount(balance, token.decimals)
        }
    })
    const isLoading =
        (nativeToken ? nativeBalance.isLoading : false) ||
        (erc20Tokens.length > 0 ? erc20Balances.isLoading : false)
    return {
        balances,
        rawBalances,
        isLoading,
    }
}
