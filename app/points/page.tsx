'use client'

import { Suspense } from 'react'
import { PointsContent } from '@/components/points/points-content'

function PointsSkeleton() {
    return (
        <div className="flex min-h-screen items-start justify-center p-4 pt-8">
            <div className="w-full max-w-5xl space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="h-8 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-10 w-full animate-pulse rounded bg-muted sm:max-w-sm" />
                </div>
                <div className="h-9 w-64 animate-pulse rounded bg-muted" />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
                <div className="h-24 animate-pulse rounded-lg bg-muted" />
                <div className="h-96 animate-pulse rounded-lg bg-muted" />
            </div>
        </div>
    )
}

export default function PointsPage() {
    return (
        <Suspense fallback={<PointsSkeleton />}>
            <PointsContent />
        </Suspense>
    )
}
