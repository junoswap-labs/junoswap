'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import { useChainId, useSwitchChain } from 'wagmi'
import { isAddress } from 'viem'
import { bitkub } from '@/lib/wagmi'
import { isLaunchpadChain } from '@/lib/abis/bonding-curve-junoswap'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TokenDetailPage } from '@/components/launchpad/token-detail-page'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function TokenPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen flex-col items-center justify-center gap-4">
                    <div className="relative flex h-16 w-16 items-center justify-center">
                        <div className="absolute inset-0 rounded-full bg-muted/40" />
                        <Loader2 className="relative h-8 w-8 animate-spin text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">Loading token...</span>
                </div>
            }
        >
            <TokenPageContent />
        </Suspense>
    )
}

function TokenPageContent() {
    const params = useParams()
    const chainId = useChainId()
    const { switchChain } = useSwitchChain()
    const tokenAddr = params.address as string

    if (!isLaunchpadChain(chainId)) {
        return (
            <div className="flex min-h-screen items-start justify-center p-4">
                <div className="w-full max-w-lg space-y-4">
                    <EmptyState
                        title="Chain Not Supported"
                        description="The launchpad is available on supported KUB networks. Please switch your network."
                        action={
                            <Button onClick={() => switchChain({ chainId: bitkub.id })}>
                                Switch Network
                            </Button>
                        }
                    />
                </div>
            </div>
        )
    }

    if (!tokenAddr || !isAddress(tokenAddr)) {
        return (
            <div className="flex min-h-screen items-start justify-center p-4">
                <div className="w-full max-w-lg space-y-4">
                    <EmptyState
                        title="Invalid Token"
                        description="The token address in the URL is not valid."
                        action={
                            <Button variant="outline" asChild>
                                <Link href="/launchpad">Back to Launchpad</Link>
                            </Button>
                        }
                    />
                </div>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-7xl px-4 py-6">
            <TokenDetailPage tokenAddr={tokenAddr as `0x${string}`} />
        </div>
    )
}
