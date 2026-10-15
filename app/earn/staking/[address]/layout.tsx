import type { Metadata } from 'next'
import { fetchStakingPoolMeta } from '@/lib/staking-og'

export async function generateMetadata({
    params,
}: {
    params: Promise<{ address: string }>
}): Promise<Metadata> {
    const { address } = await params
    const pool = await fetchStakingPoolMeta(address)
    if (!pool) return { title: 'Staking Pool — Junoswap' }

    const title = `Stake ${pool.stakingSymbol}, earn ${pool.rewardSymbol} | Junoswap`
    const description = `${pool.stakingSymbol} staking pool on Junoswap. Stake and earn ${pool.rewardSymbol} rewards.`
    return {
        title,
        description,
        openGraph: { title, description, type: 'website' },
        twitter: { card: 'summary_large_image', title, description },
    }
}

export default function StakingPoolLayout({ children }: { children: React.ReactNode }) {
    return children
}
