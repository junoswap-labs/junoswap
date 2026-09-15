import type { Address } from 'viem'
import { kubTestnet, bitkub } from './wagmi'

export interface Deployment {
    address: Address
    startBlock: number
}

/** Chains absent from a table have no deployment, which is what every caller checks for. */
const BONDING_CURVE_DEPLOYMENTS: Record<number, Deployment> = {
    [kubTestnet.id]: {
        address: '0x77e5D3fC554e30aceFd5322ca65beE15ee6E39a9',
        startBlock: 29065000,
    },
    [bitkub.id]: {
        address: '0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e',
        startBlock: 32995517,
    },
}

const AGG_ROUTER_DEPLOYMENTS: Record<number, Deployment> = {
    [bitkub.id]: {
        address: '0x869A40921A332e0D79300F91361A3DC77F2a0ebc',
        startBlock: 32685221,
    },
}

export function getBondingCurveDeployment(chainId: number): Deployment | undefined {
    return BONDING_CURVE_DEPLOYMENTS[chainId]
}

export function getAggRouterDeployment(chainId: number): Deployment | undefined {
    return AGG_ROUTER_DEPLOYMENTS[chainId]
}
