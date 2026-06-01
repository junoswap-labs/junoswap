'use client'

import { Suspense } from 'react'
import { LeaderboardContent } from '@/components/leaderboard/leaderboard-content'

function LeaderboardSkeleton() {
    return (
        <div className="flex min-h-screen items-start justify-center p-4 pt-8">
            <div className="w-full max-w-5xl space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="h-8 w-36 animate-pulse rounded-lg bg-muted" />
                    <div className="h-10 w-full animate-pulse rounded-md bg-muted sm:max-w-sm" />
                </div>
                <div className="flex gap-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-muted" />
                    ))}
                </div>
                <div className="rounded-xl border bg-card">
                    <div className="p-0">
                        <div className="bg-muted/30 px-4 py-3">
                            <div className="flex gap-8">
                                {[40, 80, 70, 70, 60, 50].map((w, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            'h-3 animate-pulse rounded bg-muted',
                                            i >= 4 && 'hidden lg:block',
                                            i === 4 && 'hidden md:block'
                                        )}
                                        style={{ width: w }}
                                    />
                                ))}
                            </div>
                        </div>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-8 border-b px-4 py-3">
                                <div className="h-5 w-8 animate-pulse rounded bg-muted" />
                                <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                                <div className="hidden h-5 w-20 animate-pulse rounded bg-muted md:block" />
                                <div className="hidden h-5 w-16 animate-pulse rounded bg-muted lg:block" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

function cn(...classes: (string | undefined | false)[]) {
    return classes.filter(Boolean).join(' ')
}

export default function LeaderboardPage() {
    return (
        <Suspense fallback={<LeaderboardSkeleton />}>
            <LeaderboardContent />
        </Suspense>
    )
}
