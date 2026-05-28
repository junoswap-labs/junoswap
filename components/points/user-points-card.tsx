'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCompact } from '@/services/launchpad'
import { formatAddress } from '@/lib/utils'
import { PointsTierBadge } from './points-tier-badge'
import type { UserPointsSummary } from '@/hooks/usePointsData'

interface UserPointsCardProps {
    address: string
    summary: UserPointsSummary
}

const TIER_COLORS: Record<string, string> = {
    Bronze: 'from-amber-500/20',
    Silver: 'from-slate-400/20',
    Gold: 'from-yellow-400/20',
    Platinum: 'from-cyan-400/20',
    Diamond: 'from-violet-400/20',
}

export function UserPointsCard({ address, summary }: UserPointsCardProps) {
    const tierColor = TIER_COLORS[summary.tierName] ?? 'from-primary/10'

    return (
        <Card className={`card-glow bg-gradient-to-br ${tierColor} via-card to-card/80`}>
            <CardContent className="p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-muted-foreground">
                            {formatAddress(address)}
                        </span>
                        <PointsTierBadge tier={summary.tierName.toLowerCase()} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div>
                            <span className="text-muted-foreground">Points </span>
                            <span className="font-mono font-bold">
                                {summary.points.toLocaleString()}
                            </span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Rank </span>
                            <span className="font-mono font-bold">#{summary.rank}</span>
                            <span className="text-muted-foreground">
                                {' '}
                                of {summary.totalTraders}
                            </span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Volume </span>
                            <span className="font-mono font-bold">
                                ${formatCompact(summary.volumeUsd)}
                            </span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Trades </span>
                            <span className="font-mono font-bold">{summary.tradeCount}</span>
                        </div>
                    </div>
                </div>

                {summary.nextTierLabel && (
                    <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">
                                Progress to {summary.nextTierLabel}
                            </span>
                            <span className="font-mono text-muted-foreground">
                                {summary.pointsToNextTier.toLocaleString()} pts to go
                            </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-primary to-[#FF914D] transition-all duration-500"
                                style={{ width: `${summary.progressPercent}%` }}
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
