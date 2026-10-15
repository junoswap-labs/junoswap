'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useChainId, useSwitchChain } from 'wagmi'
import { Button } from '@/components/ui/button'
import { FarmBackLink, FarmDetail } from '@/components/mining/farm-detail'
import { getChainMetadata } from '@/lib/wagmi'
import { parseChainId } from '@/lib/swap-params'

function FarmPageContent() {
    const { incentiveId } = useParams<{ incentiveId: string }>()
    const urlChain = parseChainId(useSearchParams().get('chain') ?? undefined)
    const walletChainId = useChainId()
    const { switchChain, isPending } = useSwitchChain()
    const wrongChain = urlChain !== null && urlChain !== walletChainId

    return (
        <div className="flex min-h-screen items-start justify-center p-4 pt-8">
            <div className="w-full max-w-5xl space-y-4">
                <FarmBackLink />
                {wrongChain && (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-3 text-sm">
                        <span>
                            This farm is on{' '}
                            {getChainMetadata(urlChain)?.name ?? `chain ${urlChain}`}.
                        </span>
                        <Button
                            size="sm"
                            isLoading={isPending}
                            onClick={() => switchChain({ chainId: urlChain })}
                        >
                            Switch network
                        </Button>
                    </div>
                )}
                <FarmDetail incentiveId={incentiveId} />
            </div>
        </div>
    )
}

export default function FarmPage() {
    return (
        <Suspense>
            <FarmPageContent />
        </Suspense>
    )
}
