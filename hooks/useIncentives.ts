'use client'

import { useMemo } from 'react'
import { useReadContracts, useChainId } from 'wagmi'
import type { Address } from 'viem'
import type { Incentive, IncentiveKey } from '@/types/earn'
import type { Token } from '@/types/tokens'
import { getV3StakerAddress } from '@/lib/dex-config'
import { findTokenByAddress } from '@/lib/tokens'
import { UNISWAP_V3_STAKER_ABI } from '@/lib/abis/uniswap-v3-staker'
import { UNISWAP_V3_POOL_ABI } from '@/lib/abis/uniswap-v3-pool'
import { ERC20_ABI } from '@/lib/abis/erc20'
import { computeIncentiveId } from '@/services/mining/staking'
import { isIncentiveActive, isIncentiveEnded } from '@/services/mining/incentives'

export function useIncentives(incentiveKeys: IncentiveKey[]): {
    incentives: Incentive[]
    isLoading: boolean
    refetch: () => void
} {
    const chainId = useChainId()
    const stakerAddress = getV3StakerAddress(chainId)
    const incentiveIds = useMemo(
        () => incentiveKeys.map((key) => computeIncentiveId(key)),
        [incentiveKeys]
    )
    const incentiveContracts = useMemo(() => {
        if (!stakerAddress) return []
        return incentiveIds.map((id) => ({
            address: stakerAddress,
            abi: UNISWAP_V3_STAKER_ABI,
            functionName: 'incentives' as const,
            args: [id] as const,
            chainId,
        }))
    }, [stakerAddress, incentiveIds, chainId])
    const {
        data: incentiveData,
        isLoading: isLoadingIncentives,
        refetch: refetchIncentives,
    } = useReadContracts({
        contracts: incentiveContracts,
        query: {
            enabled: incentiveContracts.length > 0,
            staleTime: 30_000, // 30 seconds
        },
    })
    const poolContracts = useMemo(() => {
        return incentiveKeys.flatMap((key) => [
            {
                address: key.pool,
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'token0' as const,
                chainId,
            },
            {
                address: key.pool,
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'token1' as const,
                chainId,
            },
            {
                address: key.pool,
                abi: UNISWAP_V3_POOL_ABI,
                functionName: 'fee' as const,
                chainId,
            },
        ])
    }, [incentiveKeys, chainId])
    const { data: poolData, isLoading: isLoadingPools } = useReadContracts({
        contracts: poolContracts,
        query: {
            enabled: poolContracts.length > 0,
            staleTime: 60_000, // 1 minute
        },
    })
    const tokenAddresses = useMemo(() => {
        const addresses = new Set<Address>()
        incentiveKeys.forEach((key) => addresses.add(key.rewardToken))
        if (poolData) {
            for (let i = 0; i < incentiveKeys.length; i++) {
                const token0 = poolData[i * 3]?.result as Address | undefined
                const token1 = poolData[i * 3 + 1]?.result as Address | undefined
                if (token0) addresses.add(token0)
                if (token1) addresses.add(token1)
            }
        }
        return Array.from(addresses)
    }, [incentiveKeys, poolData])
    const tokenContracts = useMemo(() => {
        return tokenAddresses.flatMap((address) => [
            { address, abi: ERC20_ABI, functionName: 'symbol' as const, chainId },
            { address, abi: ERC20_ABI, functionName: 'name' as const, chainId },
            { address, abi: ERC20_ABI, functionName: 'decimals' as const, chainId },
        ])
    }, [tokenAddresses, chainId])
    const { data: tokenData, isLoading: isLoadingTokens } = useReadContracts({
        contracts: tokenContracts,
        query: {
            enabled: tokenContracts.length > 0,
            staleTime: 300_000, // 5 minutes
        },
    })
    const tokenInfoMap = useMemo(() => {
        const map = new Map<string, Token>()
        if (!tokenData) return map
        tokenAddresses.forEach((address, index) => {
            const symbol = tokenData[index * 3]?.result as string | undefined
            const name = tokenData[index * 3 + 1]?.result as string | undefined
            const decimals = tokenData[index * 3 + 2]?.result as number | undefined
            if (symbol && decimals !== undefined) {
                const tokenFromConfig = findTokenByAddress(chainId, address)
                map.set(address.toLowerCase(), {
                    address,
                    symbol,
                    name: name ?? symbol,
                    decimals,
                    chainId,
                    logo: tokenFromConfig?.logo,
                })
            }
        })
        return map
    }, [tokenData, tokenAddresses, chainId])
    const incentives = useMemo<Incentive[]>(() => {
        if (!incentiveData || !poolData) return []
        return incentiveKeys
            .map((key, index) => {
                const result = incentiveData[index]?.result as [bigint, bigint, bigint] | undefined
                if (!result) return null
                const token0Address = poolData[index * 3]?.result as Address | undefined
                const token1Address = poolData[index * 3 + 1]?.result as Address | undefined
                const poolFee = poolData[index * 3 + 2]?.result as number | undefined
                const rewardTokenInfo = tokenInfoMap.get(key.rewardToken.toLowerCase())
                const poolToken0 = token0Address
                    ? tokenInfoMap.get(token0Address.toLowerCase())
                    : undefined
                const poolToken1 = token1Address
                    ? tokenInfoMap.get(token1Address.toLowerCase())
                    : undefined
                if (!rewardTokenInfo || !poolToken0 || !poolToken1 || poolFee === undefined) {
                    return null
                }
                return {
                    ...key,
                    incentiveId: incentiveIds[index]!,
                    totalRewardUnclaimed: result[0],
                    totalSecondsClaimedX128: result[1],
                    numberOfStakes: Number(result[2]),
                    rewardTokenInfo,
                    poolToken0,
                    poolToken1,
                    poolFee,
                    isActive: isIncentiveActive(key),
                    isEnded: isIncentiveEnded(key),
                }
            })
            .filter((i): i is Incentive => i !== null)
    }, [incentiveKeys, incentiveIds, incentiveData, poolData, tokenInfoMap])
    return {
        incentives,
        isLoading: isLoadingIncentives || isLoadingPools || isLoadingTokens,
        refetch: refetchIncentives,
    }
}
