'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { parseEther } from 'viem'
import type { Address } from 'viem'
import { BONDING_CURVE_JUNOSWAP_CHAIN_ID } from '@/lib/abis/bonding-curve-junoswap'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { ponderRequest } from '@/lib/ponder-client'
import { fetchTokenTransferAddresses } from '@/lib/rpc/launchpad-queries'
import type { HolderData } from '@/lib/rpc/launchpad-queries'

export type { HolderData }

const TOKEN_HOLDERS_QUERY = `
  query TokenHolders($tokenAddr: String!) {
    tokenHolders(where: { tokenAddr: $tokenAddr }, limit: 30) {
      items {
        address
      }
    }
    tokenSnapshots(where: { tokenAddr: $tokenAddr }) {
      items {
        holderCount
      }
    }
  }
`

interface TokenHoldersResponse {
    tokenHolders: {
        items: Array<{
            address: string
        }>
    }
    tokenSnapshots: {
        items: Array<{
            holderCount: number
        }>
    }
}

const TOTAL_SUPPLY = parseEther('1000000000')

async function fetchRealBalances(
    publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
    tokenAddr: Address,
    addresses: Address[]
): Promise<HolderData[]> {
    if (addresses.length === 0) return []

    const results = await Promise.allSettled(
        addresses.map((addr) =>
            publicClient.readContract({
                address: tokenAddr,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [addr],
            })
        )
    )

    const holders: HolderData[] = results
        .map((result, i) => {
            if (result.status !== 'fulfilled') return null
            const balance = result.value as bigint
            if (balance === 0n) return null
            return {
                address: addresses[i],
                balance,
                percentage: TOTAL_SUPPLY > 0n ? Number((balance * 10000n) / TOTAL_SUPPLY) / 100 : 0,
            }
        })
        .filter((h): h is HolderData => h !== null)
        .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0))
        .slice(0, 20)

    return holders
}

export function useTokenHolders(
    tokenAddr: Address | undefined,
    poolAddress?: Address,
    isGraduated?: boolean
) {
    const publicClient = usePublicClient({ chainId: BONDING_CURVE_JUNOSWAP_CHAIN_ID })

    const { data, isLoading } = useQuery({
        queryKey: [
            'token-holders',
            tokenAddr?.toLowerCase(),
            poolAddress?.toLowerCase(),
            isGraduated,
        ],
        queryFn: async () => {
            if (!tokenAddr || !publicClient) return { holders: [], holderCount: 0 }

            let addresses: Address[]
            let holderCount: number

            if (isGraduated) {
                // For graduated tokens, use ERC20 Transfer events to find all holders
                addresses = await fetchTokenTransferAddresses(publicClient, tokenAddr)
                holderCount = addresses.length
            } else {
                // Non-graduated: Ponder only
                const result = await ponderRequest<TokenHoldersResponse>(TOKEN_HOLDERS_QUERY, {
                    tokenAddr: tokenAddr.toLowerCase(),
                })
                addresses = result.tokenHolders.items.map((h) => h.address as Address)
                holderCount = result.tokenSnapshots.items[0]?.holderCount ?? addresses.length
            }

            // Always fetch real on-chain balances via balanceOf
            const allAddresses = [...new Set(addresses)] as Address[]
            const holders = await fetchRealBalances(publicClient, tokenAddr, allAddresses)

            // Count real holders with positive balance
            const realHolderCount = holders.filter((h) => h.balance > 0n).length

            return { holders, holderCount: Math.max(holderCount, realHolderCount) }
        },
        enabled: !!tokenAddr && !!publicClient,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    return {
        holders: data?.holders ?? [],
        holderCount: data?.holderCount ?? 0,
        isLoading,
    }
}
