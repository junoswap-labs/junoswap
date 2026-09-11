import type { Address } from 'viem'
import { ProtocolType, getDexConfig } from '@coshi190/juno-moneta-sdk'
import { UNISWAP_V3_STAKER_ABI } from '@/lib/abis/uniswap-v3-staker'
import { JUNO_V3_STAKER_ABI } from '@/lib/abis/juno-v3-staker'

/** LP farming programs. The Uniswap staker comes from the SDK registry; ours is deployed here. */
export type EarnProgram = 'v3' | 'juno-v3'

export const EARN_PROGRAMS: EarnProgram[] = ['v3', 'juno-v3']

export const EARN_PROGRAM_LABEL: Record<EarnProgram, string> = {
    v3: 'v3Staker',
    'juno-v3': 'Juno-v3Staker',
}

/** What the two stakers actually differ on, in the words a staker cares about. */
export const EARN_PROGRAM_BADGE: Record<EarnProgram, { label: string; hint: string }> = {
    v3: {
        label: 'Pool-wide',
        hint: 'v3Staker — the reward is measured against the whole pool, so unstaked liquidity dilutes your share.',
    },
    'juno-v3': {
        label: 'Staked-only',
        hint: 'Juno-v3Staker — the reward is split between staked positions only, and scaled by your in-range uptime.',
    },
}

/** Contracts we deploy ourselves, keyed by chain. `deployBlock` bounds the log scan — these
 * farms are not indexed, so the incentive list is built from IncentiveCreated logs. */
const JUNO_STAKER: Record<number, { address: Address; deployBlock: bigint }> = {
    25925: {
        address: '0x9766424962CBB7482AA58f0c9842673515ABec9a',
        deployBlock: 33240557n,
    },
}

const STAKING_REWARDS_FACTORY: Record<number, { factory: Address; lens: Address }> = {
    25925: {
        factory: '0xaEfbD7E9a6984Eb061a2c952ED0EAa71CE65117c',
        lens: '0xb740cD3df209905CdB28B18c1f6CbF2c96772012',
    },
}

export function getJunoStaker(chainId: number) {
    return JUNO_STAKER[chainId]
}

export function getStakingRewards(chainId: number) {
    return STAKING_REWARDS_FACTORY[chainId]
}

/**
 * Which staker a hook should call. The two contracts share every function signature we use, so
 * calldata built from `UNISWAP_V3_STAKER_ABI` is valid against both — only `incentives()` and
 * `stakes()` return different tuples, and those call sites pick the ABI below instead.
 */
export function getStakerAddress(chainId: number, program: EarnProgram): Address | undefined {
    if (program === 'juno-v3') return JUNO_STAKER[chainId]?.address
    return getDexConfig(chainId, undefined, ProtocolType.V3)?.staker
}

/** Programs actually deployed on this chain. Anything absent is hidden rather than shown broken. */
export function getAvailablePrograms(chainId: number): EarnProgram[] {
    return EARN_PROGRAMS.filter((program) => !!getStakerAddress(chainId, program))
}

export function getStakerAbi(program: EarnProgram) {
    return program === 'juno-v3' ? JUNO_V3_STAKER_ABI : UNISWAP_V3_STAKER_ABI
}
