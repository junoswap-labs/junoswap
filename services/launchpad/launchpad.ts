import { formatEther } from 'viem'
import type { Address } from 'viem'
import type { V3PoolRow } from '@/types/pools'
import { resolveLaunchpadLogo } from '@/lib/logo'
import { applyLaunchpadTokenOverride } from '@/lib/launchpad-token-config'
import type { LaunchTokenEntity, LAUNCH_TOKEN_DETAIL_FIELDS } from '@/lib/ponder-fields'
import type { LaunchToken } from '@/types/launchpad'

export type RawLaunchTokenItem = Pick<
    LaunchTokenEntity,
    (typeof LAUNCH_TOKEN_DETAIL_FIELDS)[number]
>

export function mapLaunchTokenItem(raw: RawLaunchTokenItem, chainId: number): LaunchToken {
    const item = applyLaunchpadTokenOverride(raw, chainId)
    return {
        address: item.tokenAddr as Address,
        name: item.name ?? '',
        symbol: item.symbol ?? '',
        logo: resolveLaunchpadLogo(item.logo),
        description: item.description ?? '',
        link1: item.link1 ?? '',
        link2: item.link2 ?? '',
        link3: item.link3 ?? '',
        link4: item.link4 ?? '',
        creator: item.creator as Address,
        createdTime: item.createdTime,
        chainId,
        graduatedAt: item.graduatedAt ?? null,
        isGraduated: item.isGraduated === 1,
    }
}

export function formatKub(weiValue: bigint): string {
    const formatted = formatEther(weiValue)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.0001) return '<0.0001'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    if (num < 1000000) return num.toFixed(2)
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function formatKubRounded(weiValue: bigint): string {
    const num = Math.round(parseFloat(formatEther(weiValue)))
    return num.toLocaleString('en-US')
}

export function formatTokenAmount(weiValue: bigint): string {
    const formatted = formatEther(weiValue)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.0001) return '<0.0001'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    if (num < 1000000) return `${(num / 1000).toFixed(2)}K`
    if (num < 1000000000) return `${(num / 1000000).toFixed(2)}M`
    return `${(num / 1000000000).toFixed(2)}B`
}

export function formatCompact(num: number, decimals = 1): string {
    if (num === 0) return '0'
    if (num < 0.01) return '<0.01'
    if (num < 1) return num.toFixed(2)
    if (num < 1000) return num.toFixed(0)
    if (num < 1000000) return `${(num / 1000).toFixed(decimals)}K`
    if (num < 1000000000) return `${(num / 1000000).toFixed(decimals)}M`
    return `${(num / 1000000000).toFixed(decimals)}B`
}

/** Launchpad tokens graduate into the 1% V3 pool. */
export const GRADUATED_POOL_FEE = 10000

export function findGraduatedPool(
    pools: V3PoolRow[],
    tokenAddr: string,
    wrappedNative: string,
    fee: number
): V3PoolRow | undefined {
    const token = tokenAddr.toLowerCase()
    const native = wrappedNative.toLowerCase()
    return pools.find((pool) => {
        if (pool.fee !== fee) return false
        const token0 = pool.token0.toLowerCase()
        const token1 = pool.token1.toLowerCase()
        return (token0 === token && token1 === native) || (token0 === native && token1 === token)
    })
}
