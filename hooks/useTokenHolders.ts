'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { parseEther } from 'viem'
import type { Address } from 'viem'
import { useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { ponderRequest } from '@/lib/ponder-client'
import type { HolderData } from '@/lib/rpc/launchpad-queries'

export type { HolderData }

// Wide candidate window: balances are text in Ponder so there's no reliable numeric
// orderBy, and fetchRealBalances re-reads on-chain balances to pick the real top 20.
// A larger pull keeps the true top holders in range for graduated tokens, which can
// have many more holders than the bonding-curve phase.
const TOKEN_HOLDERS_QUERY = `
  query TokenHolders($tokenAddr: String!) {
    tokenHolders(where: { tokenAddr: $tokenAddr }, limit: 200) {
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
    const chainId = useLaunchpadChainId()
    const publicClient = usePublicClient({ chainId })

    const { data, isLoading } = useQuery({
        queryKey: [
            'token-holders',
            tokenAddr?.toLowerCase(),
            poolAddress?.toLowerCase(),
            isGraduated,
        ],
        queryFn: async () => {
            if (!tokenAddr || !publicClient) return { holders: [], holderCount: 0 }

            // Ponder's tokenHolder table tracks holders across the whole lifecycle —
            // bonding-curve swaps, P2P transfers, and post-graduation V3-pool trades — so
            // the same query serves graduated and non-graduated tokens.
            const result = await ponderRequest<TokenHoldersResponse>(TOKEN_HOLDERS_QUERY, {
                tokenAddr: tokenAddr.toLowerCase(),
            })
            const addresses = result.tokenHolders.items.map((h) => h.address as Address)
            const holderCount = result.tokenSnapshots.items[0]?.holderCount ?? addresses.length

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
