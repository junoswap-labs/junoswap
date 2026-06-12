'use client'

import { Suspense } from 'react'
import { BridgeCard } from '@/components/bridge/bridge-card'

function BridgeContent() {
    return (
        <div className="flex min-h-screen items-start justify-center p-4">
            <div className="w-full max-w-md space-y-4">
                <BridgeCard />
            </div>
        </div>
    )
}

export default function BridgePage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">Loading...</div>
            }
        >
            <BridgeContent />
        </Suspense>
    )
}
