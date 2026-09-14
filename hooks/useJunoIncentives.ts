'use client'

import { useMemo } from 'react'
import { useChainId, usePublicClient, useReadContracts } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { parseAbiItem, type Address } from 'viem'
import type { V3PoolRow } from '@/types/pools'
import type { Incentive } from '@/types/earn'
import type { Token } from '@/types/token'
import { JUNO_V3_STAKER_ABI } from '@/lib/abis/juno-v3-staker'
import { getJunoStaker } from '@/lib/earn-programs'
import { findTokenByAddress } from '@/lib/tokens'
import { computeIncentiveId } from '@/services/mining/staking'
import { isIncentiveActive, isIncentiveEnded } from '@/services/mining/incentives'
import { useV3Pools } from '@/hooks/useV3Pools'
import { useV3Tokens } from '@/hooks/useV3Tokens'

const INCENTIVE_CREATED = parseAbiItem(
    'event IncentiveCreated(address indexed rewardToken, address indexed pool, uint256 startTime, uint256 endTime, address refundee, uint256 reward)'
)

// ponytail: fixed-size log scan from the deploy block. Fine while the staker is young; move the
// list into the ponder indexer once the range costs more than a handful of requests.
const LOG_CHUNK = 50_000n

/** The Juno staker is not indexed, so its incentive list is rebuilt from IncentiveCreated logs. */
export function useJunoIncentives(enabled = true): {
    incentives: Incentive[]
    isLoading: boolean
    refetch: () => void
} {
    const chainId = useChainId()
    const client = usePublicClient({ chainId })
    const deployment = getJunoStaker(chainId)
    const isEnabled = enabled && !!client && !!deployment

    const {
        data: created,
        isLoading: isLoadingLogs,
        refetch: refetchLogs,
    } = useQuery({
        queryKey: ['juno-incentives', chainId, deployment?.address],
        queryFn: async () => {
            if (!client || !deployment) return []
            const latest = await client.getBlockNumber()
            const logs = []
            for (let from = deployment.deployBlock; from <= latest; from += LOG_CHUNK) {
                const to = from + LOG_CHUNK - 1n
                logs.push(
                    ...(await client.getLogs({
                        address: deployment.address,
                        event: INCENTIVE_CREATED,
                        fromBlock: from,
                        toBlock: to < latest ? to : latest,
                    }))
                )
            }
            return logs.map((log) => {
                const key = {
                    rewardToken: log.args.rewardToken as Address,
                    pool: log.args.pool as Address,
                    startTime: Number(log.args.startTime),
                    endTime: Number(log.args.endTime),
                    refundee: log.args.refundee as Address,
                }
                return { key, incentiveId: computeIncentiveId(key), reward: log.args.reward ?? 0n }
            })
        },
        enabled: isEnabled,
        staleTime: 60_000,
    })

    const rows = useMemo(() => created ?? [], [created])

    const {
        data: stateData,
        isLoading: isLoadingState,
        refetch: refetchState,
    } = useReadContracts({
        contracts: rows.map((row) => ({
            address: deployment?.address as Address,
            abi: JUNO_V3_STAKER_ABI,
            functionName: 'incentives' as const,
            args: [row.incentiveId] as const,
            chainId,
        })),
        query: { enabled: isEnabled && rows.length > 0, staleTime: 30_000 },
    })

    const { pools, isLoading: isLoadingPools } = useV3Pools(chainId, isEnabled)
    const { tokens: v3Tokens, isLoading: isLoadingTokens } = useV3Tokens(chainId)

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
        return rows
            .map((row, index): Incentive | null => {
                const pool = poolByAddress.get(row.key.pool.toLowerCase())
                const rewardTokenInfo = tokenByAddress.get(row.key.rewardToken.toLowerCase())
                const poolToken0 = pool ? tokenByAddress.get(pool.token0.toLowerCase()) : undefined
                const poolToken1 = pool ? tokenByAddress.get(pool.token1.toLowerCase()) : undefined
                if (!pool || !rewardTokenInfo || !poolToken0 || !poolToken1) return null

                // incentives() → (totalReward, totalRewardUnclaimed, rewardPerLiquidityX128,
                // stakedLiquidity, lastUpdateTime, numberOfStakes)
                const state = stateData?.[index]?.result as
                    | readonly [bigint, bigint, bigint, bigint, bigint, bigint]
                    | undefined

                return {
                    ...row.key,
                    incentiveId: row.incentiveId,
                    program: 'juno-v3',
                    totalRewardUnclaimed: state?.[1] ?? row.reward,
                    // The Juno staker splits the drip between staked positions instead of tracking
                    // pool-wide liquidity-seconds, so it has no equivalent accumulator to report.
                    totalSecondsClaimedX128: 0n,
                    numberOfStakes: Number(state?.[5] ?? 0n),
                    rewardTokenInfo,
                    poolToken0,
                    poolToken1,
                    poolFee: pool.fee,
                    isActive: isIncentiveActive(row.key),
                    isEnded: isIncentiveEnded(row.key),
                    createdAt: null,
                }
            })
            .filter((i): i is Incentive => i !== null)
    }, [rows, stateData, poolByAddress, tokenByAddress])

    const refetch = useMemo(
        () => () => {
            void refetchLogs()
            void refetchState()
        },
        [refetchLogs, refetchState]
    )

    return {
        incentives,
        isLoading: isLoadingLogs || isLoadingState || isLoadingPools || isLoadingTokens,
        refetch,
    }
}
