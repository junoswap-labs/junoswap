'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useChainId, useSwitchChain } from 'wagmi'
import { isAddress } from 'viem'
import { toast } from 'sonner'
import { getChainMetadata } from '@/lib/wagmi'
import { getBondingCurveDeployment } from '@/lib/deployments'
import { parseChainId } from '@/lib/swap-params'
import { LaunchpadChainProvider, useLaunchpadChainId } from '@/hooks/useLaunchpadChainId'
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
    const searchParams = useSearchParams()
    const walletChainId = useChainId()
    const tokenAddr = params.address as string
    const urlChain = parseChainId(searchParams.get('chain') ?? undefined)
    const fallbackChainId = useLaunchpadChainId()
    const activeChainId =
        urlChain !== null && getBondingCurveDeployment(urlChain) !== undefined
            ? urlChain
            : fallbackChainId
    const { switchChain } = useSwitchChain()
    const promptedRef = useRef(false)
    useEffect(() => {
        if (promptedRef.current) return
        if (!walletChainId || walletChainId === activeChainId) return
        promptedRef.current = true
        const chainName = getChainMetadata(activeChainId)?.name || `Chain ${activeChainId}`
        toast.info(`Switch to ${chainName}?`, {
            description: 'This token trades on a different network.',
            action: {
                label: 'Switch',
                onClick: () => switchChain({ chainId: activeChainId }),
            },
            duration: 10000,
        })
    }, [walletChainId, activeChainId, switchChain])

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
        <LaunchpadChainProvider chainId={activeChainId}>
            <div className="mx-auto max-w-7xl px-4 py-6">
                <TokenDetailPage tokenAddr={tokenAddr as `0x${string}`} />
            </div>
        </LaunchpadChainProvider>
    )
}
