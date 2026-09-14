'use client'

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchTokenHolders, fetchTokenSnapshots } from '@coshi190/juno-moneta-sdk'
import { INITIAL_TOKEN_SUPPLY } from '@/lib/launchpad-curve'
import { ponderClient } from '@/lib/ponder-client'
import type { HolderData } from '@/types/launchpad'

export type { HolderData }

const HOLDER_FIELDS = ['address', 'balance'] as const

const SNAPSHOT_HOLDER_COUNT_FIELDS = ['holderCount'] as const

// ponytail: balances come from the indexer (same source that decides who is a holder), so every
// holder is listed without an on-chain read per address. If indexer lag ever matters, verify the
// visible page on-chain instead of reintroducing a global scan limit.
export function toHolders(rows: { address: string; balance: string | bigint }[]): HolderData[] {
    const byAddress = new Map<string, bigint>()
    for (const row of rows) {
        const balance = BigInt(row.balance)
        if (balance > 0n) byAddress.set(row.address.toLowerCase(), balance)
    }

    return [...byAddress]
        .map(([address, balance]) => ({
            address: address as Address,
            balance,
            percentage:
                INITIAL_TOKEN_SUPPLY > 0n
                    ? Number((balance * 10000n) / INITIAL_TOKEN_SUPPLY) / 100
                    : 0,
        }))
        .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0))
}

export function useTokenHolders(
    tokenAddr: Address | undefined,
    poolAddress?: Address,
    isGraduated?: boolean
) {
    const { data, isLoading } = useQuery({
        queryKey: [
            'token-holders',
            tokenAddr?.toLowerCase(),
            poolAddress?.toLowerCase(),
            isGraduated,
        ],
        queryFn: async () => {
            if (!tokenAddr) return { holders: [], holderCount: 0 }

            const [rows, snapshots] = await Promise.all([
                fetchTokenHolders(ponderClient, { tokenAddr }, HOLDER_FIELDS),
                fetchTokenSnapshots(
                    ponderClient,
                    { tokenAddrs: [tokenAddr] },
                    SNAPSHOT_HOLDER_COUNT_FIELDS
                ),
            ])

            const holders = toHolders(rows)
            const holderCount = Math.max(snapshots[0]?.holderCount ?? 0, holders.length)

            return { holders, holderCount }
        },
        enabled: !!tokenAddr,
        staleTime: 30_000,
        refetchInterval: 30_000,
    })

    return {
        holders: data?.holders ?? [],
        holderCount: data?.holderCount ?? 0,
        isLoading,
    }
}
