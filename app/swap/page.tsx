'use client'

import { useChainId, useSwitchChain } from 'wagmi'
import { kubTestnet, jbc, bitkub, worldchain, base, bsc } from '@/lib/wagmi'
import { Button } from '@/components/ui/button'
import { SwapCard } from '@/components/swap/swap-card'
import { DexSelectCard } from '@/components/swap/dex-select-card'
import { SwapChartWrapper } from '@/components/swap/swap-chart-wrapper'
import { useSwapStore } from '@/store/swap-store'
import { Suspense } from 'react'

const SWAP_SUPPORTED_CHAINS = [kubTestnet, bitkub, jbc, worldchain, base, bsc] as const

export default function SwapPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">Loading...</div>
            }
        >
            <SwapContent />
        </Suspense>
    )
}

function SwapContent() {
    const chainId = useChainId()
    const { switchChain } = useSwitchChain()
    const showChart = useSwapStore((state) => state.settings.showChart)
    const tokenIn = useSwapStore((state) => state.tokenIn)
    const tokenOut = useSwapStore((state) => state.tokenOut)
    const isCorrectChain = SWAP_SUPPORTED_CHAINS.some((chain) => chain.id === chainId)
    const handleSwitchChain = () => {
        switchChain({ chainId: SWAP_SUPPORTED_CHAINS[0].id })
    }
    if (!isCorrectChain) {
        return (
            <div className="flex min-h-screen items-start justify-center">
                <div className="text-center">
                    <h1 className="mb-4 text-2xl font-bold">Wrong Network</h1>
                    <p className="mb-4 text-muted-foreground">
                        Please switch to a supported network to use junoswap
                    </p>
                    <Button onClick={handleSwitchChain}>Switch Network</Button>
                </div>
            </div>
        )
    }
    return (
        <div className="flex min-h-screen items-start justify-center p-4">
            <div className="flex w-full flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
                {showChart && (
                    <div className="order-1 w-full max-w-md lg:max-w-[760px] lg:flex-1">
                        <SwapChartWrapper tokenIn={tokenIn} tokenOut={tokenOut} />
                    </div>
                )}
                <div className="order-2 w-full max-w-md space-y-4 lg:w-[448px] lg:flex-none">
                    <SwapCard />
                    <DexSelectCard />
                </div>
            </div>
        </div>
    )
}
