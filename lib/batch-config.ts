import type { Address } from 'viem'
import { bitkub, bsc, base, worldchain, jbc, kubTestnet } from '@/lib/wagmi'

// Fill in deployed contract addresses per chain
export const BATCH_TRANSFER_ADDRESSES: Partial<Record<number, Address>> = {
    [bitkub.id]: '0x67369DA9b8ae9AfaD304733b756e903432C300f4', // TODO: fill after deploy
    [kubTestnet.id]: '0xe188e927Fe4d04A4357761c6C7eD635B0a830A6f',
    [jbc.id]: '0x84342756541F8cdEFBB3c80c3401c4Bf90025591', // TODO: fill after deploy
    [worldchain.id]: '0x01837156518e60362048e78d025a419C51346f55', // TODO: fill after deploy
    [base.id]: '0x01837156518e60362048e78d025a419C51346f55', // TODO: fill after deploy
    [bsc.id]: '0x01837156518e60362048e78d025a419C51346f55', // TODO: fill after deploy
}

export function getBatchTransferAddress(chainId: number): Address | undefined {
    return BATCH_TRANSFER_ADDRESSES[chainId]
}

export const FEE_TYPE = {
    NONE: 0,
    PER_TX: 1,
    PER_ADDRESS: 2,
} as const

export type FeeType = (typeof FEE_TYPE)[keyof typeof FEE_TYPE]
