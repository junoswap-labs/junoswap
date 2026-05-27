'use client'

import { Suspense } from 'react'
import { PortfolioContent } from '@/components/portfolio/portfolio-content'

export default function PortfolioPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen">
                    <div className="animate-pulse text-muted-foreground">Loading...</div>
                </div>
            }
        >
            <PortfolioContent />
        </Suspense>
    )
}
