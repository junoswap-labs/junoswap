'use client'

import { Badge } from '@/components/ui/badge'
import { TIER_THRESHOLDS, type PointsTier } from '@/types/points'

const tierConfig = Object.fromEntries(TIER_THRESHOLDS.map((t) => [t.name, t]))

export function PointsTierBadge({ tier }: { tier: PointsTier | string }) {
    const config = tierConfig[tier as PointsTier] ?? TIER_THRESHOLDS[0]!
    return (
        <Badge
            variant="outline"
            className="bg-muted/30 text-foreground/70 border-border/50 text-[10px] font-semibold uppercase tracking-wider"
        >
            {config.label}
        </Badge>
    )
}
