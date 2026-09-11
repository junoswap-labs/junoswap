'use client'

import {
    EARN_PROGRAMS,
    getStakerAbi,
    getStakerAddress,
    type EarnProgram,
} from '@/lib/earn-programs'
import { useMemo } from 'react'
import { useReadContracts, useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { StakedPosition, Incentive, DepositInfo, PositionWithTokens } from '@/types/earn'
import { fetchPositionsByTokenIds } from '@coshi190/juno-moneta-sdk'
import { UNISWAP_V3_STAKER_ABI } from '@/lib/abis/uniswap-v3-staker'
import { ponderClient, isPonderError } from '@/lib/ponder-client'
export function useStakedPositions(
    positions: PositionWithTokens[],
    incentives: Incentive[],
    owner: Address | undefined
): {
    stakedPositions: StakedPosition[]
    depositedPositions: PositionWithTokens[]
    isLoading: boolean
    refetch: () => void
} {
    const chainId = useChainId()
    const stakerAddresses = useMemo(
        () =>
            EARN_PROGRAMS.map((program) => getStakerAddress(chainId, program)).filter(
                (a): a is Address => !!a
            ),
        [chainId]
    )
    const tokenIdKey = useMemo(() => positions.map((p) => p.tokenId.toString()), [positions])
    const {
        data: depositRows,
        isLoading: isLoadingDeposits,
        refetch: refetchDeposits,
    } = useQuery({
        queryKey: ['staked-deposits', chainId, tokenIdKey],
        queryFn: async () => {
            try {
                return await fetchPositionsByTokenIds(ponderClient, {
                    chainId,
                    tokenIds: positions.map((p) => p.tokenId),
                })
            } catch (e) {
                if (isPonderError(e)) return []
                throw e
            }
        },
        enabled: !!owner && stakerAddresses.length > 0 && positions.length > 0,
        staleTime: 15_000, // 15 seconds
    })
    const depositedPositionIds = useMemo(() => {
        if (!depositRows) return new Set<string>()
        const stakers = new Set(stakerAddresses.map((a) => a.toLowerCase()))
        const deposited = new Set<string>()
        for (const row of depositRows) {
            if (stakers.has(row.owner.toLowerCase())) deposited.add(row.tokenId.toString())
        }
        return deposited
    }, [depositRows, stakerAddresses])
    const depositedPositions = useMemo(() => {
        return positions.filter((p) => depositedPositionIds.has(p.tokenId.toString()))
    }, [positions, depositedPositionIds])
    const stakeContracts = useMemo(() => {
        if (depositedPositions.length === 0 || incentives.length === 0) return []
        const contracts: Array<{
            address: Address
            abi: ReturnType<typeof getStakerAbi>
            functionName: 'stakes'
            args: readonly [bigint, `0x${string}`]
            chainId: number
        }> = []
        depositedPositions.forEach((position) => {
            incentives.forEach((incentive) => {
                const staker = getStakerAddress(chainId, incentive.program)
                if (!staker) return
                contracts.push({
                    address: staker,
                    abi: getStakerAbi(incentive.program),
                    functionName: 'stakes' as const,
                    args: [position.tokenId, incentive.incentiveId] as const,
                    chainId,
                })
            })
        })
        return contracts
    }, [depositedPositions, incentives, chainId])
    const {
        data: stakeData,
        isLoading: isLoadingStakes,
        refetch: refetchStakes,
    } = useReadContracts({
        contracts: stakeContracts,
        query: {
            enabled: stakeContracts.length > 0,
            staleTime: 15_000,
        },
    })
    const stakedPositions = useMemo<StakedPosition[]>(() => {
        if (!stakeData || depositedPositions.length === 0 || incentives.length === 0) {
            return []
        }
        const result: StakedPosition[] = []
        let stakeIndex = 0
        depositedPositions.forEach((position) => {
            incentives.forEach((incentive) => {
                const stake = stakeData[stakeIndex]?.result as readonly bigint[] | undefined
                stakeIndex++
                // Juno returns (rewardPerLiquidityInitialX128, …, liquidity at 3); Uniswap (…, liquidity at 1)
                const liquidity = stake?.[incentive.program === 'juno-v3' ? 3 : 1]
                if (stake && liquidity !== undefined && liquidity > 0n) {
                    result.push({
                        tokenId: position.tokenId,
                        incentiveId: incentive.incentiveId,
                        liquidity,
                        secondsPerLiquidityInsideInitialX128: stake[0] ?? 0n,
                        position,
                        incentive,
                        pendingRewards: 0n, // Fetched separately via useRewards
                    })
                }
            })
        })
        return result
    }, [depositedPositions, incentives, stakeData])
    const refetch = () => {
        refetchDeposits()
        refetchStakes()
    }
    return {
        stakedPositions,
        depositedPositions,
        isLoading: isLoadingDeposits || isLoadingStakes,
        refetch,
    }
}

export function useDepositInfo(
    tokenId: bigint | undefined,
    program: EarnProgram = 'v3'
): {
    deposit: DepositInfo | null
    isDeposited: boolean
    isLoading: boolean
} {
    const chainId = useChainId()
    const stakerAddress = getStakerAddress(chainId, program)
    const { data, isLoading } = useReadContracts({
        contracts: [
            {
                address: stakerAddress!,
                abi: UNISWAP_V3_STAKER_ABI,
                functionName: 'deposits' as const,
                args: [tokenId!] as const,
                chainId,
            },
        ],
        query: {
            enabled: !!stakerAddress && tokenId !== undefined,
            staleTime: 15_000,
        },
    })
    const deposit = useMemo<DepositInfo | null>(() => {
        const result = data?.[0]?.result as [Address, number, number, number] | undefined
        if (!result) return null

        return {
            owner: result[0],
            numberOfStakes: result[1],
            tickLower: result[2],
            tickUpper: result[3],
        }
    }, [data])
    const isDeposited =
        deposit !== null && deposit.owner !== '0x0000000000000000000000000000000000000000'
    return {
        deposit,
        isDeposited,
        isLoading,
    }
}
