'use client'

import { useChainId } from 'wagmi'
import {
    BONDING_CURVE_JUNOSWAP_CHAIN_ID,
    getBondingCurveAddress,
    isLaunchpadChain,
} from '@/lib/abis/bonding-curve-junoswap'
import type { Address } from 'viem'

/**
 * The launchpad chain the UI currently operates on: the connected wallet chain when
 * it has a deployed bonding curve, otherwise the default launchpad chain. This lets
 * testnet and mainnet launchpads run in parallel — each user's launchpad follows the
 * chain their wallet is on — while still showing the default chain's tokens when the
 * wallet is disconnected or on a non-launchpad chain.
 */
export function useLaunchpadChainId(): number {
    const chainId = useChainId()
    return isLaunchpadChain(chainId) ? chainId : BONDING_CURVE_JUNOSWAP_CHAIN_ID
}

/** Connected launchpad chain id + its bonding-curve address, resolved together. */
export function useLaunchpadContract(): { chainId: number; address: Address | undefined } {
    const chainId = useLaunchpadChainId()
    return { chainId, address: getBondingCurveAddress(chainId) }
}
