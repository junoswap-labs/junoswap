'use client'

import { Suspense, useState } from 'react'
import { useChainId } from 'wagmi'
import { kubTestnet } from '@/lib/wagmi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { TokenList } from '@/components/launchpad/token-list'
import { CreateTokenDialog } from '@/components/launchpad/create-token-dialog'
import { ActivityTicker } from '@/components/launchpad/activity-feed'
import { useLaunchpadStore } from '@/store/launchpad-store'
import { Plus, Search, Unplug } from 'lucide-react'

export default function LaunchpadPage() {
    return (
        <Suspense
            fallback={
                <div className="mx-auto px-4 max-w-[1700px] py-6 sm:px-6 lg:px-8">
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-28 animate-pulse rounded-lg bg-muted" />
                            <div className="h-10 w-full animate-pulse rounded-md bg-muted sm:max-w-sm" />
                        </div>
                        <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
                    </div>
                    <div className="mb-4 flex items-center justify-between">
                        <div className="flex gap-2">
                            {[1, 2, 3, 4].map((i) => (
                                <div
                                    key={i}
                                    className="h-8 w-20 animate-pulse rounded-full bg-muted"
                                />
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <Card key={i}>
                                <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                                    <div className="h-24 w-24 shrink-0 animate-pulse rounded-xl bg-muted lg:h-[120px] lg:w-[120px]" />
                                    <div className="min-w-0 flex-1 space-y-2 py-0.5">
                                        <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                                        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                                        <div className="mt-3 flex items-center justify-between">
                                            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                                            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                                        </div>
                                        <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            }
        >
            <LaunchpadContent />
        </Suspense>
    )
}

function LaunchpadContent() {
    const chainId = useChainId()
    const { setIsCreateDialogOpen } = useLaunchpadStore()
    const [searchQuery, setSearchQuery] = useState('')

    if (chainId !== kubTestnet.id) {
        return (
            <div className="flex min-h-screen items-start justify-center p-4">
                <div className="w-full max-w-lg space-y-4">
                    <EmptyState
                        icon={Unplug}
                        variant="error"
                        title="Chain Not Supported"
                        description="Launchpad is currently available on KUB Testnet only. Please switch your network."
                    />
                </div>
            </div>
        )
    }

    return (
        <div className="mx-auto px-4 max-w-[1700px] py-6 sm:px-6 lg:px-8">
            {/* Live trade ticker */}
            <ActivityTicker />

            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-transparent sm:text-2xl">
                        Launchpad
                    </h1>
                    <div className="relative flex-1 sm:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search tokens, CA"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 rounded-lg border border-input bg-muted/30 focus-visible:ring-1 focus-visible:ring-primary/30"
                        />
                    </div>
                </div>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Create Token
                </Button>
            </div>

            {/* Token list */}
            <TokenList searchQuery={searchQuery} />

            {/* Create token dialog */}
            <CreateTokenDialog />
        </div>
    )
}
