'use client'

import { Suspense, useState } from 'react'
import { useChainId } from 'wagmi'
import { kubTestnet } from '@/lib/wagmi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { TokenList } from '@/components/launchpad/token-list'
import { CreateTokenDialog } from '@/components/launchpad/create-token-dialog'
import { ActivityTicker } from '@/components/launchpad/activity-feed'
import { useLaunchpadStore } from '@/store/launchpad-store'
import { Plus, Search, Unplug, Loader2 } from 'lucide-react'

export default function LaunchpadPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen flex-col items-center justify-center gap-4">
                    <div className="relative flex h-16 w-16 items-center justify-center">
                        <div className="absolute inset-0 rounded-full bg-muted/40" />
                        <Loader2 className="relative h-8 w-8 animate-spin text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">Loading launchpad...</span>
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
        <div className="mx-auto px-4 py-6 sm:px-6 lg:px-8">
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
                            className="pl-9"
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
