'use client'

import { useMemo, useRef } from 'react'
import { useReadContracts } from 'wagmi'
import { type Address } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/lib/tokens'
export interface TokenHolding {
    token: Token
    rawBalance: bigint
    formattedBalance: string
}

type HoldingsByAddress = Map<string, Map<string, TokenHolding>>

const EMPTY_HOLDINGS: HoldingsByAddress = new Map()

export function useMultiBalances(tokens: Token[], addresses: Address[], chainId: number) {
    const enabled = addresses.length > 0 && tokens.length > 0

    const {
        data: erc20Results,
        isLoading: isErc20Loading,
        isFetching,
    } = useReadContracts({
        contracts: addresses.flatMap((addr) =>
            tokens.map((token) => ({
                address: token.address as Address,
                abi: getAbi('erc20'),
                functionName: 'balanceOf' as const,
                args: [addr],
                chainId,
            }))
        ),
        query: { enabled },
    })

    const scope = `${chainId}:${addresses.join(',').toLowerCase()}`
    const cacheRef = useRef<{ scope: string; holdings: HoldingsByAddress } | null>(null)
    if (cacheRef.current && cacheRef.current.scope !== scope) cacheRef.current = null

    const holdings = useMemo(() => {
        const numTokens = tokens.length
        if (!erc20Results || erc20Results.length !== addresses.length * numTokens) {
            return cacheRef.current?.holdings ?? EMPTY_HOLDINGS
        }

        const map: HoldingsByAddress = new Map()
        addresses.forEach((addr, addrIdx) => {
            const addrKey = addr.toLowerCase()
            const cached = cacheRef.current?.holdings.get(addrKey)

            tokens.forEach((token, tokenIdx) => {
                const tokenKey = token.address.toLowerCase()
                const result = erc20Results[addrIdx * numTokens + tokenIdx]

                const holding: TokenHolding | undefined =
                    result?.status === 'success'
                        ? (result.result as bigint) > 0n
                            ? {
                                  token,
                                  rawBalance: result.result as bigint,
                                  formattedBalance: formatTokenAmount(
                                      result.result as bigint,
                                      token.decimals
                                  ),
                              }
                            : undefined
                        : cached?.get(tokenKey)

                if (!holding) return

                let tokenMap = map.get(addrKey)
                if (!tokenMap) {
                    tokenMap = new Map()
                    map.set(addrKey, tokenMap)
                }
                tokenMap.set(tokenKey, holding)
            })
        })

        cacheRef.current = { scope, holdings: map }
        return map
    }, [erc20Results, addresses, tokens, scope])

    return {
        holdings,
        isLoading: isErc20Loading && cacheRef.current === null,
        isFetching,
        isSettled: !enabled || erc20Results?.length === addresses.length * tokens.length,
    }
}
