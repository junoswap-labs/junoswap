'use client'

import { useRef } from 'react'
import { useShareableImage } from '@/hooks/useShareableImage'
import { formatCompact } from '@/services/launchpad'
import { getTierForPoints } from '@/types/points'
import { Share2 } from 'lucide-react'
import type { UserPointsSummary } from '@/hooks/usePointsData'

interface ShareablePointsBannerProps {
    address?: string
    userSummary: UserPointsSummary | null
    totalPoints: number
    totalVolumeUsd: number
    totalTraders: number
    isConnected: boolean
}

const TIER_GRADIENT_FROM: Record<string, string> = {
    bronze: 'from-amber-400/15 dark:from-amber-600/25',
    silver: 'from-slate-300/15 dark:from-slate-400/20',
    gold: 'from-yellow-300/15 dark:from-yellow-500/20',
    platinum: 'from-cyan-300/15 dark:from-cyan-400/20',
    diamond: 'from-violet-400/15 dark:from-violet-500/25',
}

function getTierGradientFrom(tierName: string): string {
    return TIER_GRADIENT_FROM[tierName.toLowerCase()] ?? 'from-primary/10'
}

function buildPlaceholderSummary(totalTraders: number): UserPointsSummary {
    return {
        points: 0,
        rank: 0,
        totalTraders,
        volumeUsd: 0,
        tradeCount: 0,
        tierName: 'Bronze',
        nextTierLabel: 'Silver',
        pointsToNextTier: 100,
        progressPercent: 0,
    }
}

function LogoMark({ size = 28 }: { size?: number }) {
    return (
        <div
            className="bg-gradient-to-br from-primary to-[#FF914D]"
            style={{
                width: size,
                height: size,
                WebkitMaskImage: 'url(/logo.svg)',
                maskImage: 'url(/logo.svg)',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
            }}
        />
    )
}

function StatItem({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-xl font-bold tracking-tight sm:text-2xl">{value}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
            </span>
        </div>
    )
}

export function ShareablePointsBanner({
    address: _address,
    userSummary,
    totalPoints: _totalPoints,
    totalVolumeUsd: _totalVolumeUsd,
    totalTraders,
    isConnected,
}: ShareablePointsBannerProps) {
    const cardRef = useRef<HTMLDivElement>(null)
    const { shareImage, isGenerating } = useShareableImage()

    const isEmptyState = !isConnected || !userSummary
    const resolvedSummary = userSummary ?? buildPlaceholderSummary(totalTraders)
    const resolvedTier = getTierForPoints(resolvedSummary.points)

    const handleCapture = (action: (el: HTMLElement) => Promise<void>) => {
        if (!cardRef.current) return
        action(cardRef.current)
    }

    return (
        <div>
            {/* The card that gets captured as an image */}
            <div ref={cardRef} className="overflow-hidden rounded-xl bg-card">
                <div
                    className={`card-glow relative overflow-hidden rounded-xl bg-gradient-to-br ${getTierGradientFrom(resolvedTier.name)} via-card to-card`}
                >
                    <div className="px-5 py-5 sm:px-7 sm:py-6">
                        {/* Header: Logo + Share button */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <LogoMark size={24} />
                                <span className="bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-lg font-bold text-transparent">
                                    Junoswap
                                </span>
                            </div>
                            {!isEmptyState && (
                                <button
                                    onClick={() => handleCapture(shareImage)}
                                    disabled={isGenerating}
                                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                                >
                                    <Share2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {/* Unified stats card for all states */}
                        <ConnectedCard tier={resolvedTier} summary={resolvedSummary} />
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ── Stats card (used for all states) ────────────────────────── */

function ConnectedCard({
    tier,
    summary,
}: {
    tier: (typeof import('@/types/points').TIER_THRESHOLDS)[number]
    summary: UserPointsSummary
}) {
    return (
        <>
            {/* Tier badge — centered */}
            <div className="mt-5 flex justify-center">
                {summary.points > 0 ? (
                    <div
                        className={`${tier.bg} ${tier.border} inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5`}
                    >
                        <span
                            className={`text-xs font-bold uppercase tracking-widest ${tier.color}`}
                        >
                            {tier.label} Tier
                        </span>
                    </div>
                ) : (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-muted/50 bg-muted/20 px-4 py-1.5">
                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            No Tier
                        </span>
                    </div>
                )}
            </div>

            {/* Stats row */}
            <div className="mt-5 grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:gap-4">
                <StatItem value={summary.points.toLocaleString()} label="Points" />
                <StatItem
                    value={summary.rank > 0 ? `#${summary.rank}` : '#--'}
                    label={`Rank of ${summary.totalTraders.toLocaleString()}`}
                />
                <StatItem value={`$${formatCompact(summary.volumeUsd)}`} label="Volume" />
                <StatItem value={summary.tradeCount.toLocaleString()} label="Trades" />
            </div>

            {/* Progress bar to next tier */}
            {summary.nextTierLabel && (
                <div className="mt-5">
                    <div className="mb-1.5 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">
                            Progress to {summary.nextTierLabel}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground">
                                {summary.pointsToNextTier.toLocaleString()} pts to go
                            </span>
                            <span className="font-mono font-medium">
                                {Math.round(summary.progressPercent)}%
                            </span>
                        </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-[#FF914D] transition-all duration-500"
                            style={{ width: `${summary.progressPercent}%` }}
                        />
                    </div>
                </div>
            )}
        </>
    )
}
