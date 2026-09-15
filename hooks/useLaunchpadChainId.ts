'use client'

import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useChainId } from 'wagmi'
import { getBondingCurveDeployment } from '@/lib/deployments'
import type { Address } from 'viem'
import { kubTestnet } from '@/lib/wagmi'

export const DEFAULT_LAUNCHPAD_CHAIN_ID: number = kubTestnet.id

const LaunchpadChainContext = createContext<number | undefined>(undefined)

export function LaunchpadChainProvider({
    chainId,
    children,
}: {
    chainId: number | undefined
    children: ReactNode
}) {
    return createElement(LaunchpadChainContext.Provider, { value: chainId }, children)
}

export function useLaunchpadChainId(): number {
    const override = useContext(LaunchpadChainContext)
    const chainId = useChainId()
    if (override !== undefined) return override
    return getBondingCurveDeployment(chainId) !== undefined ? chainId : DEFAULT_LAUNCHPAD_CHAIN_ID
}

export function useLaunchpadContract(): { chainId: number; address: Address | undefined } {
    const chainId = useLaunchpadChainId()
    return { chainId, address: getBondingCurveDeployment(chainId)?.address }
}
