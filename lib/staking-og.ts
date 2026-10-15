import { createPublicClient, formatUnits, http, zeroAddress, type Address } from 'viem'
import { getAbi } from '@coshi190/juno-moneta-sdk'
import { STAKING_REWARDS_LENS_ABI } from '@/lib/abis/staking-rewards'
import { getStakingRewards } from '@/lib/earn-programs'
import { kubTestnet } from '@/lib/wagmi'
import { getStakingStatus, rewardPerSecond } from '@/services/staking/metrics'
import type { StakingPoolStatus, StakingPoolView } from '@/types/staking'

export interface StakingPoolMeta {
    stakingSymbol: string
    rewardSymbol: string
    creator: Address
    totalStaked: number
    dailyReward: number
    lockSeconds: number
    status: StakingPoolStatus
}

// ponytail: staking only exists on KUB testnet today, and an opengraph-image route cannot read the
// share URL's ?chain. Make this a lookup by chain when a second deployment ships.
const CHAIN = kubTestnet

export async function fetchStakingPoolMeta(poolAddress: string): Promise<StakingPoolMeta | null> {
    const deployment = getStakingRewards(CHAIN.id)
    if (!deployment) return null
    try {
        const client = createPublicClient({ chain: CHAIN, transport: http() })
        const [, addresses, , views] = (await client.readContract({
            address: deployment.lens,
            abi: STAKING_REWARDS_LENS_ABI,
            functionName: 'statesByFactory',
            args: [deployment.factory, zeroAddress, 0n, 100n],
        })) as readonly [bigint, readonly Address[], unknown, readonly StakingPoolView[], unknown]
        const index = addresses.findIndex((a) => a.toLowerCase() === poolAddress.toLowerCase())
        const view = views[index]
        if (!view) return null

        const erc20 = getAbi('erc20')
        const read = (address: Address, functionName: 'symbol' | 'decimals') =>
            client.readContract({ address, abi: erc20, functionName })
        const [stakingSymbol, stakingDecimals, rewardSymbol, rewardDecimals] = await Promise.all([
            read(view.stakingToken, 'symbol'),
            read(view.stakingToken, 'decimals'),
            read(view.rewardsToken, 'symbol'),
            read(view.rewardsToken, 'decimals'),
        ])
        return {
            stakingSymbol: String(stakingSymbol),
            rewardSymbol: String(rewardSymbol),
            creator: view.creator,
            totalStaked: Number(formatUnits(view.totalSupply, Number(stakingDecimals))),
            dailyReward: rewardPerSecond(view, Number(rewardDecimals)) * 86_400,
            lockSeconds: Number(view.lockDuration),
            status: getStakingStatus(view, Math.floor(Date.now() / 1000)),
        }
    } catch {
        return null
    }
}
