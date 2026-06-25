import { TokenIconSkeleton } from '@/components/ui/token-icon'

export function TokenDetailSkeleton() {
    return (
        <div className="space-y-3 md:space-y-4">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />

            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <div className="flex items-center gap-3">
                    <TokenIconSkeleton size="lg" variant="square" className="md:h-14 md:w-14" />
                    <div className="space-y-2">
                        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    </div>
                </div>
                <div className="h-10 w-48 animate-pulse rounded bg-muted" />
                <div className="h-6 w-20 animate-pulse rounded bg-muted" />
            </div>

            <div className="grid gap-4 md:gap-6 lg:grid-cols-12">
                <div className="order-2 space-y-3 md:space-y-4 lg:order-1 lg:col-span-8">
                    <div className="flex gap-6">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="flex flex-col gap-1.5">
                                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                            </div>
                        ))}
                    </div>

                    <div className="h-[364px] animate-pulse rounded-lg border bg-muted/50 md:h-[464px] lg:h-[554px]" />

                    <div className="rounded-lg border bg-card p-4">
                        <div className="mb-3 h-4 w-28 animate-pulse rounded bg-muted" />
                        <div className="space-y-2.5">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="flex gap-4">
                                    <div className="h-4 w-10 animate-pulse rounded bg-muted" />
                                    <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                                    <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                                    <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                                    <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="order-1 lg:order-2 lg:col-span-4">
                    <div className="h-[480px] animate-pulse rounded-xl border bg-muted/50" />
                </div>
            </div>
        </div>
    )
}
