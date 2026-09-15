'use client'

import { useMemo } from 'react'
import { useChainId, useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { getAbi, getDexes } from '@coshi190/juno-moneta-sdk'

export const BURN_ADDRESS: Address = '0x000000000000000000000000000000000000dEaD'

/** RPC-call ceiling for scanning the burn address's positions; a very active chain could exceed this. */
const MAX_BURNED_POSITIONS_SCANNED = 50

type PositionsResult = readonly [
    number,
    Address,
    Address,
    Address,
    number,
    number,
    number,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
]

interface PoolKey {
    token0: Address
    token1: Address
    fee: number
}

/**
 * A graduated launchpad token's initial full-range LP is sent to the burn address, so it can never
 * be staked — but it still counts toward the pool's active liquidity and dilutes stakers' share.
 * There's no per-pool index for this yet, so this scans the burn address's NFT positions on the
 * shared position manager and filters down to the target pool.
 *
 * TODO(indexer): replace this with a Ponder-indexed "burned liquidity per pool" field once the
 * indexer tracks Transfer-to-burn-address events on the position manager — this scan is capped at
 * MAX_BURNED_POSITIONS_SCANNED and can undercount once the burn address holds more positions than
 * that across the whole chain.
 */
export function useBurnedPoolLiquidity(pool: PoolKey | null): {
    burnedLiquidity: bigint
    isLoading: boolean
} {
    const chainId = useChainId()
    const positionManager = getDexes(chainId, 'v3')[0]?.positionManager

    const { data: balance, isLoading: isLoadingBalance } = useReadContract({
        address: positionManager,
        abi: getAbi('positionManager'),
        functionName: 'balanceOf',
        args: [BURN_ADDRESS],
        query: { enabled: !!positionManager && !!pool },
    })

    const scanCount = balance ? Math.min(Number(balance), MAX_BURNED_POSITIONS_SCANNED) : 0

    const tokenIdContracts = useMemo(() => {
        if (!positionManager || scanCount === 0) return []
        return Array.from({ length: scanCount }, (_, i) => ({
            address: positionManager,
            abi: getAbi('positionManager'),
            functionName: 'tokenOfOwnerByIndex' as const,
            args: [BURN_ADDRESS, BigInt(i)] as const,
            chainId,
        }))
    }, [positionManager, scanCount, chainId])

    const { data: tokenIdResults, isLoading: isLoadingTokenIds } = useReadContracts({
        contracts: tokenIdContracts,
        query: { enabled: tokenIdContracts.length > 0 },
    })

    const tokenIds = useMemo(
        () =>
            (tokenIdResults ?? [])
                .map((r) => r.result as bigint | undefined)
                .filter((id): id is bigint => id !== undefined),
        [tokenIdResults]
    )

    const positionContracts = useMemo(() => {
        if (!positionManager || tokenIds.length === 0) return []
        return tokenIds.map((tokenId) => ({
            address: positionManager,
            abi: getAbi('positionManager'),
            functionName: 'positions' as const,
            args: [tokenId] as const,
            chainId,
        }))
    }, [positionManager, tokenIds, chainId])

    const { data: positionResults, isLoading: isLoadingPositions } = useReadContracts({
        contracts: positionContracts,
        query: { enabled: positionContracts.length > 0 },
    })

    const burnedLiquidity = useMemo(() => {
        if (!pool || !positionResults) return 0n
        let total = 0n
        for (const entry of positionResults) {
            const p = entry.result as PositionsResult | undefined
            if (!p) continue
            if (
                p[2].toLowerCase() === pool.token0.toLowerCase() &&
                p[3].toLowerCase() === pool.token1.toLowerCase() &&
                p[4] === pool.fee
            ) {
                total += p[7]
            }
        }
        return total
    }, [pool, positionResults])

    return {
        burnedLiquidity,
        isLoading: isLoadingBalance || isLoadingTokenIds || isLoadingPositions,
    }
}
