'use client'

import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useChainId } from 'wagmi'
import {
    getBondingCurveDeployment,
    getPrimaryLaunchpadId,
    hasBondingCurve,
} from '@/lib/deployments'
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
    return hasBondingCurve(chainId) ? chainId : DEFAULT_LAUNCHPAD_CHAIN_ID
}

/** Resolves the curve a token trades on. Omitting `launchpadId` gives the chain's primary
 *  curve, which is where new tokens are created. The resolved id comes back so callers pass the
 *  same one to the SDK, whose own default is the original 'junoswap' curve. */
export function useLaunchpadContract(launchpadId?: string): {
    chainId: number
    address: Address | undefined
    launchpadId: string
} {
    const chainId = useLaunchpadChainId()
    const resolved = launchpadId ?? getPrimaryLaunchpadId(chainId)
    return {
        chainId,
        address: getBondingCurveDeployment(chainId, resolved)?.address,
        launchpadId: resolved,
    }
}
