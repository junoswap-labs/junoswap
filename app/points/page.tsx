'use client'

import { Suspense } from 'react'
import { PointsContent } from '@/components/points/points-content'

function PointsSkeleton() {
    return (
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="h-8 w-32 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-muted sm:max-w-sm" />
            </div>
            <div className="mb-4 h-9 w-64 animate-pulse rounded bg-muted" />
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
                ))}
            </div>
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
            <div className="mt-4 h-96 animate-pulse rounded-lg bg-muted" />
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
