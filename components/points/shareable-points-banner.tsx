'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ConnectModal } from '@/components/web3/connect-modal'
import { useShareableImage } from '@/hooks/useShareableImage'
import { formatCompact } from '@/services/launchpad'
import { TIER_THRESHOLDS, getTierForPoints } from '@/types/points'
import { Share2, Wallet } from 'lucide-react'
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
    bronze: 'from-amber-600/25',
    silver: 'from-slate-400/20',
    gold: 'from-yellow-500/20',
    platinum: 'from-cyan-400/20',
    diamond: 'from-violet-500/25',
}

function getTierGradientFrom(tierName: string): string {
    return TIER_GRADIENT_FROM[tierName.toLowerCase()] ?? 'from-primary/10'
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
    totalPoints,
    totalVolumeUsd,
    totalTraders,
    isConnected,
}: ShareablePointsBannerProps) {
    const cardRef = useRef<HTMLDivElement>(null)
    const { shareImage, isGenerating } = useShareableImage()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)

    const tier = isConnected && userSummary ? getTierForPoints(userSummary.points) : null

    const handleCapture = (action: (el: HTMLElement) => Promise<void>) => {
        if (!cardRef.current) return
        action(cardRef.current)
    }

    return (
        <div>
            {/* The card that gets captured as an image */}
            <div ref={cardRef} className="overflow-hidden rounded-xl bg-[#0a0e1a]">
                <div
                    className={`card-glow relative overflow-hidden rounded-xl bg-gradient-to-br ${tier ? getTierGradientFrom(tier.name) : 'from-primary/10'} via-[#0a0e1a] to-[#0a0e1a]`}
                >
                    {/* Top accent line */}
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary to-[#FF914D]" />

                    <div className="px-5 py-5 sm:px-7 sm:py-6">
                        {/* Header: Logo + Share button */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <LogoMark size={24} />
                                <span className="bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-lg font-bold text-transparent">
                                    Junoswap
                                </span>
                            </div>
                            {isConnected && userSummary && (
                                <button
                                    onClick={() => handleCapture(shareImage)}
                                    disabled={isGenerating}
                                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                                >
                                    <Share2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {/* Connected user state */}
                        {isConnected && userSummary && tier ? (
                            <ConnectedCard tier={tier} summary={userSummary} />
                        ) : isConnected && !userSummary ? (
                            /* Connected but no swaps yet */
                            <NoDataCard />
                        ) : (
                            /* Disconnected state */
                            <DisconnectedCard
                                totalPoints={totalPoints}
                                totalVolumeUsd={totalVolumeUsd}
                                totalTraders={totalTraders}
                                onConnect={() => setIsConnectModalOpen(true)}
                            />
                        )}
                    </div>
                </div>
            </div>

            <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
        </div>
    )
}

/* ── Connected user card ────────────────────────────────────── */

function ConnectedCard({
    tier,
    summary,
}: {
    tier: (typeof TIER_THRESHOLDS)[number]
    summary: UserPointsSummary
}) {
    return (
        <>
            {/* Tier badge — centered */}
            <div className="mt-5 flex justify-center">
                <div
                    className={`${tier.bg} ${tier.border} inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5`}
                >
                    <span className={`text-xs font-bold uppercase tracking-widest ${tier.color}`}>
                        {tier.label} Tier
                    </span>
                </div>
            </div>

            {/* Stats row */}
            <div className="mt-5 grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:gap-4">
                <StatItem value={summary.points.toLocaleString()} label="Points" />
                <StatItem
                    value={`#${summary.rank}`}
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

/* ── Connected but no swaps yet ─────────────────────────────── */

function NoDataCard() {
    return (
        <div className="mt-6 flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-muted-foreground">Start trading to earn points!</p>
            <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
            >
                Go to Swap
            </Link>
        </div>
    )
}

/* ── Disconnected state ─────────────────────────────────────── */

function DisconnectedCard({
    totalPoints,
    totalVolumeUsd,
    totalTraders,
    onConnect,
}: {
    totalPoints: number
    totalVolumeUsd: number
    totalTraders: number
    onConnect: () => void
}) {
    return (
        <>
            <div className="mt-6 flex flex-col items-center gap-3">
                <p className="text-sm text-muted-foreground">
                    Connect your wallet to see your points
                </p>
                <button
                    onClick={onConnect}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                    <Wallet className="h-3.5 w-3.5" />
                    Connect Wallet
                </button>
            </div>

            {/* Aggregate stats */}
            <div className="mt-5 grid grid-cols-3 gap-4">
                <StatItem value={formatCompact(totalPoints)} label="Total Points" />
                <StatItem value={`$${formatCompact(totalVolumeUsd)}`} label="Total Volume" />
                <StatItem value={totalTraders.toLocaleString()} label="Total Traders" />
            </div>
        </>
    )
}
