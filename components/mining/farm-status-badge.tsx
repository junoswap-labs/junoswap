'use client'

import Link from 'next/link'
import { Maximize2 } from 'lucide-react'
import { useChainId } from 'wagmi'
import { Badge } from '@/components/ui/badge'
import { TokenIcon, TokenIconPair } from '@/components/ui/token-icon'
import { formatFeeTier } from '@/lib/liquidity-helpers'
import { getDisplayToken } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import type { FarmStatus } from '@/services/mining/farm-list'
import { EARN_PROGRAM_BADGE, type EarnProgram } from '@/lib/earn-programs'
import type { Incentive } from '@/types/earn'

const STATUS_LABEL: Record<FarmStatus, { label: string; className: string }> = {
    active: { label: 'Running', className: 'bg-positive/10 text-positive border-positive/20' },
    pending: { label: 'Scheduled', className: 'text-muted-foreground' },
    ended: { label: 'Ended', className: 'text-muted-foreground' },
}

export function FarmStatusBadge({ status, className }: { status: FarmStatus; className?: string }) {
    const { label, className: statusClassName } = STATUS_LABEL[status]
    return (
        <Badge variant="outline" className={cn('shrink-0', statusClassName, className)}>
            {label}
        </Badge>
    )
}

/** Which staker pays this farm. A dot rather than another pill: it is provenance, not a status. */
export function ProgramMark({ program }: { program: EarnProgram }) {
    const { label, hint } = EARN_PROGRAM_BADGE[program]
    return (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap" title={hint}>
            <span
                className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    program === 'juno-v3' ? 'bg-primary' : 'bg-muted-foreground/40'
                )}
            />
            {label}
        </span>
    )
}

/**
 * Pair icons, symbols, fee tier and the reward token — the identity block shared by card and row.
 * It shrinks rather than pushing whatever sits beside it out of the card.
 */
export function FarmIdentity({
    incentive,
    size = 'md',
    withProgram = false,
    schedule,
    expandable = false,
}: {
    incentive: Incentive
    size?: 'sm' | 'md'
    /** Only where the row is wide enough for it — cards show the mark in their footer instead. */
    withProgram?: boolean
    /** Table rows hang the schedule here instead of spending a whole column on it. */
    schedule?: React.ReactNode
    /** Adds a link to the farm's shareable full-screen page. */
    expandable?: boolean
}) {
    const chainId = useChainId()
    const token0 = getDisplayToken(incentive.poolToken0)
    const token1 = getDisplayToken(incentive.poolToken1)
    const rewardToken = getDisplayToken(incentive.rewardTokenInfo)

    return (
        <div className="flex min-w-0 flex-1 items-center gap-3">
            <TokenIconPair
                src0={token0.logo}
                symbol0={token0.symbol}
                src1={token1.logo}
                symbol1={token1.symbol}
                size={size}
                className="shrink-0"
            />
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">
                        {token0.symbol} / {token1.symbol}
                    </span>
                    {expandable && (
                        <Link
                            href={`/earn/farm/${incentive.incentiveId}?chain=${chainId}`}
                            title="Open farm full screen"
                            aria-label="Open farm full screen"
                            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Maximize2 className="h-3.5 w-3.5" />
                        </Link>
                    )}
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    <span className="shrink-0">{formatFeeTier(incentive.poolFee)}</span>
                    <span className="shrink-0 text-muted-foreground/40">·</span>
                    <span className="shrink-0">Earn</span>
                    <TokenIcon
                        src={rewardToken.logo}
                        symbol={rewardToken.symbol}
                        size="xs"
                        className="shrink-0"
                    />
                    <span className="truncate">{rewardToken.symbol}</span>
                    {withProgram && (
                        <>
                            <span className="shrink-0 text-muted-foreground/40">·</span>
                            <ProgramMark program={incentive.program} />
                        </>
                    )}
                </div>
                {schedule && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{schedule}</div>
                )}
            </div>
        </div>
    )
}
