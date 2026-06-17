'use client'

import { useRef } from 'react'
import { useShareableImage } from '@/hooks/useShareableImage'
import { formatCompact } from '@/services/launchpad'
import { getTierForPoints } from '@/types/points'
import { Download } from 'lucide-react'
import type { UserPointsSummary } from '@/hooks/usePointsData'

interface ShareablePointsBannerProps {
    address?: string
    userSummary: UserPointsSummary | null
    totalPoints: number
    totalVolumeUsd: number
    totalTraders: number
    isConnected: boolean
}

const DEFAULT_ACCENT: { text: string; bg: string; border: string } = {
    text: 'text-amber-300',
    bg: 'bg-amber-400/15',
    border: 'border-amber-300/30',
}

const TIER_ACCENT: Record<string, { text: string; bg: string; border: string }> = {
    bronze: DEFAULT_ACCENT,
    silver: { text: 'text-slate-200', bg: 'bg-slate-300/15', border: 'border-slate-200/30' },
    gold: { text: 'text-yellow-300', bg: 'bg-yellow-400/15', border: 'border-yellow-300/30' },
    platinum: { text: 'text-cyan-200', bg: 'bg-cyan-300/15', border: 'border-cyan-200/30' },
    diamond: { text: 'text-violet-300', bg: 'bg-violet-400/15', border: 'border-violet-300/30' },
}

function getTierAccent(tierName: string) {
    return TIER_ACCENT[tierName.toLowerCase()] ?? DEFAULT_ACCENT
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
        <div className="flex flex-col gap-0.5">
            <span className="font-mono text-lg font-bold tracking-tight text-white sm:text-xl">
                {value}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
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
    const { downloadImage, isGenerating } = useShareableImage()

    const isEmptyState = !isConnected || !userSummary
    const resolvedSummary = userSummary ?? buildPlaceholderSummary(totalTraders)
    const resolvedTier = getTierForPoints(resolvedSummary.points)
    const accent = getTierAccent(resolvedTier.name)
    const hasPoints = resolvedSummary.points > 0

    const handleSave = () => {
        if (!cardRef.current) return
        downloadImage(cardRef.current, 'junoswap-points.png')
    }

    return (
        <div>
            {/* The card that gets captured as an image */}
            <div ref={cardRef} className="overflow-hidden rounded-xl bg-[#0a0e14]">
                <div
                    className="relative overflow-hidden rounded-xl border border-white/10"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                    }}
                >
                    {/* Brand glows */}
                    <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-20 -right-12 h-48 w-48 rounded-full bg-[#FF914D]/15 blur-3xl" />

                    <div className="relative px-5 py-5 sm:px-7 sm:py-6">
                        {/* Header: Logo + Share button */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <LogoMark size={20} />
                                <span className="bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-base font-bold text-transparent">
                                    Junoswap
                                </span>
                            </div>
                            {!isEmptyState && (
                                <button
                                    onClick={handleSave}
                                    disabled={isGenerating}
                                    aria-label="Save image"
                                    className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                                >
                                    <Download className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {/* Body: identity + headline (left) / supporting stats (right) */}
                        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                            {/* Left — tier + headline points */}
                            <div className="min-w-0">
                                {hasPoints ? (
                                    <div
                                        className={`${accent.bg} ${accent.border} inline-flex items-center rounded-full border px-3 py-1`}
                                    >
                                        <span
                                            className={`text-[11px] font-bold uppercase tracking-widest ${accent.text}`}
                                        >
                                            {resolvedTier.label} Tier
                                        </span>
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                        <span className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                                            No Tier
                                        </span>
                                    </div>
                                )}

                                <div className="mt-3 flex items-baseline gap-2">
                                    <span className="font-mono text-4xl font-extrabold tracking-tight text-white">
                                        {resolvedSummary.points.toLocaleString()}
                                    </span>
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                                        Points
                                    </span>
                                </div>
                            </div>

                            {/* Right — supporting stats */}
                            <div className="grid grid-cols-3 gap-4 sm:gap-6 sm:text-right">
                                <StatItem
                                    value={
                                        resolvedSummary.rank > 0
                                            ? `#${resolvedSummary.rank}`
                                            : '#--'
                                    }
                                    label={`of ${resolvedSummary.totalTraders.toLocaleString()}`}
                                />
                                <StatItem
                                    value={`$${formatCompact(resolvedSummary.volumeUsd)}`}
                                    label="Volume"
                                />
                                <StatItem
                                    value={resolvedSummary.tradeCount.toLocaleString()}
                                    label="Trades"
                                />
                            </div>
                        </div>

                        {/* Progress bar to next tier */}
                        {resolvedSummary.nextTierLabel && (
                            <div className="mt-6">
                                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                                    <span className="text-white/55">
                                        Progress to {resolvedSummary.nextTierLabel}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-white/55">
                                            {resolvedSummary.pointsToNextTier.toLocaleString()} pts
                                            to go
                                        </span>
                                        <span className="font-mono font-medium tabular-nums text-white">
                                            {Math.round(resolvedSummary.progressPercent)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-primary to-[#FF914D] transition-all duration-500"
                                        style={{ width: `${resolvedSummary.progressPercent}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
