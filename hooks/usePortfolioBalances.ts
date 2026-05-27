'use client'

import { useMemo } from 'react'
import { useBalance, useReadContracts, useAccount } from 'wagmi'
import type { Address } from 'viem'
import type { Token } from '@/types/tokens'
import { formatTokenAmount } from '@/services/tokens'
import { isNativeToken } from '@/lib/wagmi'
import { ERC20_ABI } from '@/lib/abis/erc20'

export interface TokenHolding {
    token: Token
    rawBalance: bigint
    formattedBalance: string
}

export function usePortfolioBalances(tokens: Token[]) {
    const { address } = useAccount()
    const nativeToken = useMemo(
        () => tokens.find((t) => isNativeToken(t.address)) ?? null,
        [tokens]
    )
    const erc20Tokens = useMemo(() => tokens.filter((t) => !isNativeToken(t.address)), [tokens])

    const nativeBalance = useBalance({
        address,
        chainId: nativeToken?.chainId,
        query: { enabled: !!nativeToken && !!address },
    })

    const erc20Balances = useReadContracts({
        contracts: erc20Tokens.map((token) => ({
            address: token.address as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf' as const,
            args: [address as Address],
            chainId: token.chainId,
        })),
        query: { enabled: erc20Tokens.length > 0 && !!address },
    })

    const holdings = useMemo(() => {
        const map = new Map<string, TokenHolding>()

        if (nativeToken && nativeBalance.data?.value !== undefined) {
            map.set(nativeToken.address.toLowerCase(), {
                token: nativeToken,
                rawBalance: nativeBalance.data.value,
                formattedBalance: formatTokenAmount(nativeBalance.data.value, nativeToken.decimals),
            })
        }

        erc20Tokens.forEach((token, index) => {
            const result = erc20Balances.data?.[index]
            const balance = result?.result as bigint | undefined
            if (balance !== undefined && typeof balance === 'bigint' && balance > 0n) {
                map.set(token.address.toLowerCase(), {
                    token,
                    rawBalance: balance,
                    formattedBalance: formatTokenAmount(balance, token.decimals),
                })
            }
        })

        return map
    }, [nativeToken, nativeBalance.data, erc20Tokens, erc20Balances.data])

    const isLoading =
        (nativeToken ? nativeBalance.isLoading : false) ||
        (erc20Tokens.length > 0 ? erc20Balances.isLoading : false)

    return { holdings, isLoading }
}
