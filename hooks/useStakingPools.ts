'use client'

import { useMemo } from 'react'
import { useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi'
import { zeroAddress, type Address } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { STAKING_REWARDS_LENS_ABI } from '@/lib/abis/staking-rewards'
import { getStakingRewards } from '@/lib/earn-programs'
import { findTokenByAddress } from '@/lib/tokens'
import type { Token } from '@/types/token'
import type { StakingPool, StakingPoolView, StakingUserView } from '@/types/staking'

// ponytail: one page is the whole list. Add paging when a factory holds more than this.
const PAGE_SIZE = 100n

/** Every pool of the factory plus the viewer's position in each, in a single lens call. */
export function useStakingPools(): {
    pools: StakingPool[]
    isLoading: boolean
    refetch: () => void
} {
    const chainId = useChainId()
    const { address: account } = useAccount()
    const deployment = getStakingRewards(chainId)

    const {
        data,
        isLoading,
        refetch: refetchPools,
    } = useReadContract({
        address: deployment?.lens,
        abi: STAKING_REWARDS_LENS_ABI,
        functionName: 'statesByFactory',
        args: [deployment?.factory ?? zeroAddress, account ?? zeroAddress, 0n, PAGE_SIZE],
        chainId,
        query: { enabled: !!deployment, staleTime: 15_000 },
    })

    const [, addresses, infos, poolViews, userViews] = useMemo(
        () =>
            (data as
                | readonly [
                      bigint,
                      readonly Address[],
                      readonly { epoch: number }[],
                      readonly StakingPoolView[],
                      readonly StakingUserView[],
                  ]
                | undefined) ?? [0n, [], [], [], []],
        [data]
    )

    const tokenAddresses = useMemo(() => {
        const set = new Set<string>()
        for (const view of poolViews) {
            set.add(view.stakingToken.toLowerCase())
            set.add(view.rewardsToken.toLowerCase())
        }
        return [...set] as Address[]
    }, [poolViews])

    const { data: metadata, isLoading: isLoadingMeta } = useReadContracts({
        contracts: tokenAddresses.flatMap((address) => [
            { address, abi: getAbi('erc20'), functionName: 'symbol' as const, chainId },
            { address, abi: getAbi('erc20'), functionName: 'decimals' as const, chainId },
        ]),
        query: { enabled: tokenAddresses.length > 0, staleTime: 5 * 60_000 },
    })

    const tokenByAddress = useMemo(() => {
        const map = new Map<string, Token>()
        tokenAddresses.forEach((address, index) => {
            const known = findTokenByAddress(chainId, address)
            const symbol = metadata?.[index * 2]?.result as string | undefined
            const decimals = metadata?.[index * 2 + 1]?.result as number | undefined
            map.set(address.toLowerCase(), {
                address,
                symbol: known?.symbol ?? symbol ?? '???',
                name: known?.name ?? symbol ?? '',
                decimals: known?.decimals ?? Number(decimals ?? 18),
                chainId,
                logo: known?.logo,
            })
        })
        return map
    }, [tokenAddresses, metadata, chainId])

    const pools = useMemo<StakingPool[]>(() => {
        return addresses
            .map((address, index): StakingPool | null => {
                const view = poolViews[index]
                const user = userViews[index]
                if (!view || !user) return null
                const stakingTokenInfo = tokenByAddress.get(view.stakingToken.toLowerCase())
                const rewardTokenInfo = tokenByAddress.get(view.rewardsToken.toLowerCase())
                if (!stakingTokenInfo || !rewardTokenInfo) return null
                return {
                    address,
                    epoch: Number(infos[index]?.epoch ?? 1),
                    view,
                    user,
                    stakingTokenInfo,
                    rewardTokenInfo,
                }
            })
            .filter((p): p is StakingPool => p !== null)
    }, [addresses, infos, poolViews, userViews, tokenByAddress])

    return {
        pools,
        isLoading: (isLoading || isLoadingMeta) && pools.length === 0,
        refetch: () => void refetchPools(),
    }
}
