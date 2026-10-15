import { ImageResponse } from 'next/og'
import { fetchStakingPoolMeta } from '@/lib/staking-og'
import { tokenHue } from '@/lib/token-color'
import { formatDuration } from '@/lib/duration'
import { formatAddress } from '@/lib/utils'
import { formatCompact } from '@/services/launchpad/launchpad'

export const alt = 'Junoswap staking pool'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BRAND_FROM = '#ff3333'
const BRAND_TO = '#FF914D'
const STATUS_COLOR = { active: '#1ED760', pending: '#FF914D', ended: '#9ca3af', closed: '#E91429' }

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
    const { address } = await params
    const pool = await fetchStakingPoolMeta(address)

    const stakingSymbol = pool?.stakingSymbol ?? 'TOKEN'
    const hue = tokenHue(stakingSymbol)
    const stats = pool
        ? [
              ['Total staked', `${formatCompact(pool.totalStaked)} ${pool.stakingSymbol}`],
              [
                  'Daily reward',
                  pool.dailyReward > 0
                      ? `${formatCompact(pool.dailyReward)} ${pool.rewardSymbol}`
                      : '—',
              ],
              ['Lock', pool.lockSeconds > 0 ? formatDuration(pool.lockSeconds) : 'No lock'],
          ]
        : []

    return new ImageResponse(
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                padding: 72,
                backgroundColor: '#0a0e14',
                backgroundImage:
                    'radial-gradient(circle at 0% 0%, rgba(255,51,51,0.22) 0%, transparent 55%), radial-gradient(circle at 100% 100%, rgba(255,145,77,0.16) 0%, transparent 55%)',
                color: 'white',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    fontSize: 36,
                    fontWeight: 800,
                    backgroundImage: `linear-gradient(90deg, ${BRAND_FROM}, ${BRAND_TO})`,
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    color: 'transparent',
                }}
            >
                Junoswap · Token Staking
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 40 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 160,
                        height: 160,
                        borderRadius: 9999,
                        fontSize: 64,
                        fontWeight: 800,
                        color: `hsl(${hue} 70% 70%)`,
                        backgroundColor: `hsl(${hue} 70% 50% / 0.18)`,
                    }}
                >
                    {stakingSymbol
                        .replace(/[^a-zA-Z0-9]/g, '')
                        .slice(0, 2)
                        .toUpperCase() || '?'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, lineHeight: 1 }}>
                        {`Stake ${stakingSymbol.slice(0, 12)}`}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            marginTop: 14,
                            fontSize: 40,
                            color: 'rgba(255,255,255,0.6)',
                        }}
                    >
                        {pool ? `Earn ${pool.rewardSymbol.slice(0, 12)}` : 'Junoswap staking pool'}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 24, marginTop: 48 }}>
                {stats.map(([label, value]) => (
                    <div
                        key={label}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '20px 28px',
                            borderRadius: 24,
                            border: '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                fontSize: 24,
                                color: 'rgba(255,255,255,0.5)',
                            }}
                        >
                            {label}
                        </div>
                        <div
                            style={{ display: 'flex', marginTop: 6, fontSize: 38, fontWeight: 700 }}
                        >
                            {value}
                        </div>
                    </div>
                ))}
            </div>

            {pool && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 20,
                        marginTop: 'auto',
                        fontSize: 28,
                        color: 'rgba(255,255,255,0.55)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            padding: '6px 16px',
                            borderRadius: 10,
                            fontWeight: 600,
                            textTransform: 'capitalize',
                            color: STATUS_COLOR[pool.status],
                            backgroundColor: 'rgba(255,255,255,0.06)',
                        }}
                    >
                        {pool.status}
                    </div>
                    {`Created by ${formatAddress(pool.creator)}`}
                </div>
            )}
        </div>,
        size
    )
}
