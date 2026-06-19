'use client'

import { useState } from 'react'
import { ChevronDown, Share2, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Jazzicon } from '@/components/web3/jazzicon'
import { ReferralDialog } from '@/components/web3/referral-dialog'
import { useReferralRewards } from '@/hooks/useReferralRewards'
import { formatAddress } from '@/lib/utils'
import { formatCompact } from '@/services/launchpad'

interface ReferralRewardsPanelProps {
    nativeUsdPrice: number | null
}

export function ReferralRewardsPanel({ nativeUsdPrice }: ReferralRewardsPanelProps) {
    const [shareOpen, setShareOpen] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const { referralPoints, refereeCount, referees, isLoading, isSupportedChain } =
        useReferralRewards(nativeUsdPrice)

    if (!isSupportedChain) return null

    const hasReferrals = refereeCount > 0

    return (
        <Card>
            <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div>
                            <div className="flex items-baseline gap-2">
                                <span className="font-mono text-2xl font-bold tracking-tight">
                                    {isLoading ? '—' : referralPoints.toLocaleString()}
                                </span>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Referral points
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Earn 10% of the points your referrals make
                                {hasReferrals &&
                                    ` · from ${refereeCount} referral${refereeCount === 1 ? '' : 's'}`}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShareOpen(true)}
                        className="shrink-0"
                    >
                        <Share2 className="h-4 w-4" />
                        Share link
                    </Button>
                </div>

                {hasReferrals && (
                    <div className="mt-4 border-t border-border/50 pt-3">
                        <button
                            type="button"
                            onClick={() => setExpanded((v) => !v)}
                            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <span className="flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5" />
                                Referred wallets ({refereeCount})
                            </span>
                            <ChevronDown
                                className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            />
                        </button>
                        {expanded && (
                            <ul className="mt-3 space-y-2">
                                {referees.map((r) => (
                                    <li
                                        key={r.address}
                                        className="flex items-center justify-between gap-3 text-sm"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <Jazzicon
                                                address={r.address}
                                                size={20}
                                                className="shrink-0 overflow-hidden rounded-full"
                                            />
                                            <span className="truncate font-mono text-xs">
                                                {formatAddress(r.address)}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span className="font-mono font-medium tabular-nums">
                                                {r.points.toLocaleString()} pts
                                            </span>
                                            <span className="ml-1.5 text-xs text-muted-foreground">
                                                ${formatCompact(r.volumeUsd)} vol
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </CardContent>
            <ReferralDialog open={shareOpen} onOpenChange={setShareOpen} />
        </Card>
    )
}
