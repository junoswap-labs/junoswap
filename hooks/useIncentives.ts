'use client'

import { useMemo } from 'react'
import { useReadContracts, useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { Incentive } from '@/types/earn'
import {
    fetchIncentives,
    ProtocolType,
    getDexConfig,
    type V3PoolRow,
} from '@coshi190/juno-moneta-sdk'
import { UNISWAP_V3_STAKER_ABI } from '@/lib/abis/uniswap-v3-staker'
import type { Token } from '@/types/token'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
import { findTokenByAddress } from '@/lib/tokens'
import { useV3Tokens } from '@/hooks/useV3Tokens'
import { useV3Pools } from '@/hooks/useV3Pools'
import { useJunoIncentives } from '@/hooks/useJunoIncentives'
import {
    extractIncentiveCreatedAt,
    isIncentiveActive,
    isIncentiveEnded,
} from '@/services/mining/incentives'

const PONDER_INDEXED_CHAINS = new Set([25925, 96, 8899])

/** Every farm from both stakers, in one list. Each carries the `program` it belongs to. */
export function useIncentives(): {
    incentives: Incentive[]
    isLoading: boolean
    refetch: () => void
} {
    const uniswap = useUniswapIncentives(true)
    const juno = useJunoIncentives(true)
    const incentives = useMemo(
        () => [...uniswap.incentives, ...juno.incentives],
        [uniswap.incentives, juno.incentives]
    )
    const refetch = useMemo(
        () => () => {
            uniswap.refetch()
            juno.refetch()
        },
        [uniswap, juno]
    )
    return { incentives, isLoading: uniswap.isLoading || juno.isLoading, refetch }
}

/** The indexed, Uniswap-style staker: rows come from ponder, live state from the chain. */
function useUniswapIncentives(enabled: boolean): {
    incentives: Incentive[]
    isLoading: boolean
    refetch: () => void
} {
    const chainId = useChainId()
    const isIndexed = PONDER_INDEXED_CHAINS.has(chainId)
    const stakerAddress = getDexConfig(chainId, undefined, ProtocolType.V3)?.staker

    const {
        data: incentiveRows,
        isLoading: isLoadingRows,
        refetch: refetchRows,
    } = useQuery({
        queryKey: ['incentives', chainId],
        queryFn: async () => {
            try {
                return await fetchIncentives(ponderClient, { chainId })
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: enabled && isIndexed,
        staleTime: 60_000,
    })

    const { pools, isLoading: isLoadingPools } = useV3Pools(chainId, enabled && isIndexed)
    const { tokens: v3Tokens, isLoading: isLoadingTokens } = useV3Tokens(chainId)

    const rows = useMemo(() => incentiveRows ?? [], [incentiveRows])

    const stateContracts = useMemo(() => {
        if (!stakerAddress) return []
        return rows.map((row) => ({
            address: stakerAddress,
            abi: UNISWAP_V3_STAKER_ABI,
            functionName: 'incentives' as const,
            args: [row.incentiveId as `0x${string}`] as const,
            chainId,
        }))
    }, [stakerAddress, rows, chainId])

    const {
        data: stateData,
        isLoading: isLoadingState,
        refetch: refetchState,
    } = useReadContracts({
        contracts: stateContracts,
        query: {
            enabled: enabled && stateContracts.length > 0,
            staleTime: 30_000,
        },
    })

    const poolByAddress = useMemo(() => {
        const map = new Map<string, V3PoolRow>()
        for (const pool of pools) map.set(pool.address.toLowerCase(), pool)
        return map
    }, [pools])

    const tokenByAddress = useMemo(() => {
        const map = new Map<string, Token>()
        for (const t of v3Tokens) {
            const address = t.address as Address
            map.set(address.toLowerCase(), {
                address,
                symbol: t.symbol || '???',
                name: t.name || t.symbol || '',
                decimals: t.decimals ?? 18,
                chainId,
                logo: findTokenByAddress(chainId, address)?.logo,
            })
        }
        return map
    }, [v3Tokens, chainId])

    const incentives = useMemo<Incentive[]>(() => {
        const stateById = new Map<string, readonly [bigint, bigint, bigint]>()
        rows.forEach((row, index) => {
            const result = stateData?.[index]?.result as
                | readonly [bigint, bigint, bigint]
                | undefined
            if (result) stateById.set(row.incentiveId, result)
        })

        return rows
            .map((row): Incentive | null => {
                const pool = poolByAddress.get(row.pool.toLowerCase())
                const rewardTokenInfo = tokenByAddress.get(row.rewardToken.toLowerCase())
                const poolToken0 = pool ? tokenByAddress.get(pool.token0.toLowerCase()) : undefined
                const poolToken1 = pool ? tokenByAddress.get(pool.token1.toLowerCase()) : undefined
                if (!pool || !rewardTokenInfo || !poolToken0 || !poolToken1) return null

                const state = stateById.get(row.incentiveId)
                const key = {
                    rewardToken: row.rewardToken as Address,
                    pool: row.pool as Address,
                    startTime: row.startTime,
                    endTime: row.endTime,
                    refundee: row.refundee as Address,
                }

                return {
                    ...key,
                    incentiveId: row.incentiveId as `0x${string}`,
                    program: 'v3',
                    totalRewardUnclaimed: state?.[0] ?? BigInt(row.reward),
                    totalSecondsClaimedX128: state?.[1] ?? 0n,
                    numberOfStakes: Number(state?.[2] ?? 0n),
                    rewardTokenInfo,
                    poolToken0,
                    poolToken1,
                    poolFee: pool.fee,
                    isActive: isIncentiveActive(key),
                    isEnded: isIncentiveEnded(key),
                    createdAt: extractIncentiveCreatedAt(row),
                }
            })
            .filter((i): i is Incentive => i !== null)
    }, [rows, stateData, poolByAddress, tokenByAddress])

    const refetch = useMemo(
        () => () => {
            void refetchRows()
            void refetchState()
        },
        [refetchRows, refetchState]
    )

    return {
        incentives,
        isLoading: isLoadingRows || isLoadingPools || isLoadingTokens || isLoadingState,
        refetch,
    }
}
