import type { Address } from 'viem'
import { kubTestnet, bitkub } from './wagmi'

export interface Deployment {
    address: Address
    startBlock: number
}

/** The launchpad id the indexer tags a token with when nothing says otherwise. */
export const DEFAULT_LAUNCHPAD_ID = 'junoswap'

/** Chains absent from a table have no deployment, which is what every caller checks for.
 *  A chain can run several curve versions at once, keyed by the indexer's launchpad id. */
const BONDING_CURVE_DEPLOYMENTS: Record<number, Record<string, Deployment>> = {
    [kubTestnet.id]: {
        junoswap: {
            address: '0x77e5D3fC554e30aceFd5322ca65beE15ee6E39a9',
            startBlock: 29065000,
        },
        'junoswap-v1_1': {
            address: '0x22Cf23cd7799C3A24D53191C8514Dd7E42fEF790',
            startBlock: 33661943,
        },
    },
    [bitkub.id]: {
        junoswap: {
            address: '0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e',
            startBlock: 32995517,
        },
    },
}

/** The curve new tokens are created on, per chain. */
const PRIMARY_LAUNCHPAD_IDS: Record<number, string> = {
    [kubTestnet.id]: 'junoswap-v1_1',
    [bitkub.id]: 'junoswap',
}

const AGG_ROUTER_DEPLOYMENTS: Record<number, Deployment> = {
    [bitkub.id]: {
        address: '0x869A40921A332e0D79300F91361A3DC77F2a0ebc',
        startBlock: 32685221,
    },
}

export function getPrimaryLaunchpadId(chainId: number): string {
    return PRIMARY_LAUNCHPAD_IDS[chainId] ?? DEFAULT_LAUNCHPAD_ID
}

export function getBondingCurveDeployment(
    chainId: number,
    launchpadId?: string
): Deployment | undefined {
    const byLaunchpad = BONDING_CURVE_DEPLOYMENTS[chainId]
    if (!byLaunchpad) return undefined
    return byLaunchpad[launchpadId ?? getPrimaryLaunchpadId(chainId)]
}

/** Whether this chain has any curve at all, for chain-support checks that predate versioning. */
export function hasBondingCurve(chainId: number): boolean {
    return BONDING_CURVE_DEPLOYMENTS[chainId] !== undefined
}

export function getAggRouterDeployment(chainId: number): Deployment | undefined {
    return AGG_ROUTER_DEPLOYMENTS[chainId]
}
