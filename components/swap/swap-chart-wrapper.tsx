'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import type { Token } from '@/types/tokens'

const SwapChart = dynamic(() => import('./swap-chart').then((mod) => mod.SwapChart), {
    ssr: false,
    loading: () => (
        <div className="flex h-[481px] w-full flex-col items-center justify-center gap-3 rounded-xl border bg-card lg:h-[581px]">
            <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
            <span className="text-xs text-muted-foreground/60">Loading chart...</span>
        </div>
    ),
})

interface SwapChartWrapperProps {
    tokenIn?: Token | null
    tokenOut?: Token | null
    className?: string
}

export function SwapChartWrapper(props: SwapChartWrapperProps) {
    return <SwapChart {...props} />
}
