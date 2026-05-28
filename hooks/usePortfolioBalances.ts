'use client'

import { useMemo } from 'react'
import { useAccount, useBalance } from 'wagmi'
import { isNativeToken } from '@/lib/wagmi'
import { formatTokenAmount } from '@/services/tokens'
import type { Token } from '@/types/tokens'
import { useMultiBalances, type TokenHolding } from '@/hooks/use-multi-balances'

export type { TokenHolding }

export function usePortfolioBalances(tokens: Token[], chainId: number) {
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

    const addresses = useMemo(() => (address ? [address as `0x${string}`] : []), [address])
    const { holdings: erc20Holdings, isLoading: isErc20Loading } = useMultiBalances(
        erc20Tokens,
        addresses,
        chainId
    )

    const holdings = useMemo(() => {
        const map = new Map<string, TokenHolding>()

        if (
            nativeToken &&
            nativeBalance.data?.value !== undefined &&
            nativeBalance.data.value > 0n
        ) {
            map.set(nativeToken.address.toLowerCase(), {
                token: nativeToken,
                rawBalance: nativeBalance.data.value,
                formattedBalance: formatTokenAmount(nativeBalance.data.value, nativeToken.decimals),
            })
        }

        if (address) {
            const userHoldings = erc20Holdings.get(address.toLowerCase())
            if (userHoldings) {
                for (const [key, holding] of userHoldings) {
                    map.set(key, holding)
                }
            }
        }

        return map
    }, [nativeToken, nativeBalance.data, erc20Holdings, address])

    const isLoading =
        (nativeToken ? nativeBalance.isLoading : false) ||
        (erc20Tokens.length > 0 ? isErc20Loading : false)

    return { holdings, isLoading }
}
