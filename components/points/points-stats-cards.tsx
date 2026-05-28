'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCompact } from '@/services/launchpad'
import { PointsTierBadge } from './points-tier-badge'
import type { UserPointsSummary } from '@/hooks/usePointsData'

interface PointsStatsCardsProps {
    totalPoints: number
    totalVolumeUsd: number
    totalTraders: number
    userSummary: UserPointsSummary | null
    isConnected: boolean
}

function StatCard({
    label,
    value,
    children,
}: {
    label: string
    value: string
    children?: React.ReactNode
}) {
    return (
        <Card className="card-glow relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary to-[#FF914D]" />
            <CardContent className="p-4">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                </span>
                <div className="mt-1 font-mono text-2xl font-bold tracking-tight lg:text-3xl">
                    {value}
                </div>
                {children}
            </CardContent>
        </Card>
    )
}

export function PointsStatsCards({
    totalPoints,
    totalVolumeUsd,
    totalTraders,
    userSummary,
    isConnected,
}: PointsStatsCardsProps) {
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard label="Total Points" value={formatCompact(totalPoints)} />
            <StatCard label="Total Volume" value={`$${formatCompact(totalVolumeUsd)}`} />
            <StatCard label="Total Traders" value={totalTraders.toLocaleString()} />
            <StatCard
                label="Your Points"
                value={isConnected && userSummary ? userSummary.points.toLocaleString() : '—'}
            >
                {userSummary && (
                    <div className="mt-1.5">
                        <PointsTierBadge tier={userSummary.tierName.toLowerCase()} />
                    </div>
                )}
            </StatCard>
        </div>
    )
}
