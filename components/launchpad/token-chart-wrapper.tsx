'use client'

import dynamic from 'next/dynamic'
import type { Address } from 'viem'
import { Loader2 } from 'lucide-react'

const TokenChart = dynamic(() => import('./token-chart').then((mod) => mod.TokenChart), {
    ssr: false,
    loading: () => (
        <div className="flex h-[364px] flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-card md:h-[464px] lg:h-[554px]">
            <div className="relative flex h-14 w-14 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-muted/40" />
                <Loader2 className="relative h-6 w-6 animate-spin text-primary/60" />
            </div>
            <span className="text-xs text-muted-foreground/60">Loading chart...</span>
        </div>
    ),
})

interface TokenChartWrapperProps {
    tokenAddr: Address
    className?: string
}

export function TokenChartWrapper(props: TokenChartWrapperProps) {
    return <TokenChart {...props} />
}
