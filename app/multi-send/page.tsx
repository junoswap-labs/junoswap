'use client'

import { Suspense } from 'react'
import { useChainId, useSwitchChain } from 'wagmi'
import { kubTestnet, jbc, bitkub, worldchain, base, bsc } from '@/lib/wagmi'
import { Button } from '@/components/ui/button'
import { MultiSendCard } from '@/components/multi-send/multi-send-card'

const MULTI_SEND_SUPPORTED_CHAINS = [kubTestnet, bitkub, jbc, worldchain, base, bsc] as const

export default function MultiSendPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">Loading...</div>
            }
        >
            <MultiSendContent />
        </Suspense>
    )
}

function MultiSendContent() {
    const chainId = useChainId()
    const { switchChain } = useSwitchChain()
    const isCorrectChain = MULTI_SEND_SUPPORTED_CHAINS.some((chain) => chain.id === chainId)

    if (!isCorrectChain) {
        return (
            <div className="flex min-h-screen items-start justify-center p-4">
                <div className="text-center">
                    <h1 className="mb-4 text-2xl font-bold">Wrong Network</h1>
                    <p className="mb-4 text-muted-foreground">
                        Please switch to a supported network to use Multi-Send
                    </p>
                    <Button
                        onClick={() => switchChain({ chainId: MULTI_SEND_SUPPORTED_CHAINS[0].id })}
                    >
                        Switch Network
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-start justify-center p-4">
            <div className="w-full max-w-2xl space-y-4">
                <MultiSendCard />
            </div>
        </div>
    )
}
