'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { type Address } from 'viem'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { formatTokenAmount } from '@/services/tokens'
import type { Token } from '@/types/tokens'

export interface TokenHolding {
    token: Token
    rawBalance: bigint
    formattedBalance: string
}

export function useMultiBalances(tokens: Token[], addresses: Address[], chainId: number) {
    // ERC20 balances: batch all (address × token) pairs
    const { data: erc20Results, isLoading: isErc20Loading } = useReadContracts({
        contracts: addresses.flatMap((addr) =>
            tokens.map((token) => ({
                address: token.address as Address,
                abi: ERC20_ABI,
                functionName: 'balanceOf' as const,
                args: [addr],
                chainId,
            }))
        ),
        query: { enabled: addresses.length > 0 && tokens.length > 0 },
    })

    const holdings = useMemo(() => {
        const map = new Map<string, Map<string, TokenHolding>>()

        if (erc20Results) {
            const numTokens = tokens.length
            addresses.forEach((addr, addrIdx) => {
                tokens.forEach((token, tokenIdx) => {
                    const resultIdx = addrIdx * numTokens + tokenIdx
                    const balance = erc20Results[resultIdx]?.result as bigint | undefined
                    if (balance && balance > 0n) {
                        let tokenMap = map.get(addr.toLowerCase())
                        if (!tokenMap) {
                            tokenMap = new Map()
                            map.set(addr.toLowerCase(), tokenMap)
                        }
                        tokenMap.set(token.address.toLowerCase(), {
                            token,
                            rawBalance: balance,
                            formattedBalance: formatTokenAmount(balance, token.decimals),
                        })
                    }
                })
            })
        }

        return map
    }, [erc20Results, addresses, tokens])

    return {
        holdings,
        isLoading: isErc20Loading,
    }
}
