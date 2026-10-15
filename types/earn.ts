import type { EarnProgram } from '@/lib/earn-programs'
import type { RangePreset } from '@/lib/range-presets'
import type { Address } from 'viem'
import type { Token } from '@/types/token'
export interface V3Position {
    tokenId: bigint
    nonce: bigint
    operator: Address
    token0: Address
    token1: Address
    fee: number
    tickLower: number
    tickUpper: number
    liquidity: bigint
    feeGrowthInside0LastX128: bigint
    feeGrowthInside1LastX128: bigint
    tokensOwed0: bigint
    tokensOwed1: bigint
}

export interface PositionWithTokens extends V3Position {
    token0Info: Token
    token1Info: Token
    poolAddress: Address
    inRange: boolean
    currentTick: number
    amount0: bigint
    amount1: bigint
    uncollectedFees0: bigint
    uncollectedFees1: bigint
}

export interface PositionDetails extends PositionWithTokens {
    currentTick: number
    sqrtPriceX96: bigint
    poolLiquidity: bigint
    priceLower: string
    priceUpper: string
    currentPrice: string
    totalValueUsd?: number
    feesValueUsd?: number
}

export interface V3PoolData {
    address: Address
    token0: Token
    token1: Token
    fee: number
    liquidity: bigint
    sqrtPriceX96: bigint
    tick: number
    tickSpacing: number
    tvlUsd?: number
    volume24h?: number
    apr?: number
}

export interface AddLiquidityParams {
    token0: Token
    token1: Token
    fee: number
    tickLower: number
    tickUpper: number
    amount0Desired: bigint
    amount1Desired: bigint
    slippageTolerance: number // basis points (e.g., 50 = 0.5%)
    deadline: number
    recipient: Address
    createPool?: boolean
    initialSqrtPriceX96?: bigint
}

export interface IncreaseLiquidityParams {
    tokenId: bigint
    amount0Desired: bigint
    amount1Desired: bigint
    slippageTolerance: number
    deadline: number
}

export interface RemoveLiquidityParams {
    tokenId: bigint
    liquidity: bigint
    amount0Min: bigint
    amount1Min: bigint
    /** Absolute unix deadline, as produced by the SDK liquidity planners. */
    deadline: bigint
    collectFees: boolean
}

export type { RangePreset }

export interface RangeConfig {
    preset: RangePreset
    tickLower: number
    tickUpper: number
    priceLower: string
    priceUpper: string
}

export interface MintCallParams {
    token0: Address
    token1: Address
    fee: number
    tickLower: number
    tickUpper: number
    amount0Desired: bigint
    amount1Desired: bigint
    amount0Min: bigint
    amount1Min: bigint
    recipient: Address
    deadline: bigint
}

export interface IncreaseLiquidityCallParams {
    tokenId: bigint
    amount0Desired: bigint
    amount1Desired: bigint
    amount0Min: bigint
    amount1Min: bigint
    deadline: bigint
}

export interface DecreaseLiquidityCallParams {
    tokenId: bigint
    liquidity: bigint
    amount0Min: bigint
    amount1Min: bigint
    deadline: bigint
}

export interface CollectCallParams {
    tokenId: bigint
    recipient: Address
    amount0Max: bigint
    amount1Max: bigint
}

export const MAX_UINT128 = 2n ** 128n - 1n

export const DEFAULT_RANGE_CONFIG: RangeConfig = {
    preset: 'common',
    tickLower: 0,
    tickUpper: 0,
    priceLower: '0',
    priceUpper: '0',
}

export interface IncentiveKey {
    rewardToken: Address
    pool: Address
    startTime: number
    endTime: number
    refundee: Address
}

export interface Incentive extends IncentiveKey {
    incentiveId: `0x${string}` // keccak256 hash of IncentiveKey
    /** Which staker holds this farm — the two run side by side and share the list. */
    program: EarnProgram
    totalRewardUnclaimed: bigint
    totalSecondsClaimedX128: bigint
    numberOfStakes: number
    rewardTokenInfo: Token
    poolToken0: Token
    poolToken1: Token
    poolFee: number
    isActive: boolean
    isEnded: boolean
    /** Indexer creation time; null when the row doesn't record one. */
    createdAt: number | null
}

export interface StakedPosition {
    tokenId: bigint
    incentiveId: `0x${string}`
    liquidity: bigint
    secondsPerLiquidityInsideInitialX128: bigint
    position: PositionWithTokens
    incentive: Incentive
    pendingRewards: bigint
}

export interface DepositInfo {
    owner: Address
    numberOfStakes: number
    tickLower: number
    tickUpper: number
}

export interface UnstakeParams {
    tokenId: bigint
    incentiveKey: IncentiveKey
}

/** Immutable caps baked into the deployed UniswapV3Staker. Read per chain, never hardcoded. */
export interface StakerLimits {
    maxIncentiveDuration: number
    maxIncentiveStartLeadTime: number
}

export type StartMode = 'now' | 'scheduled'

export interface CreateIncentiveForm {
    pool: V3PoolData | null
    rewardToken: Token | null
    rewardAmount: string
    startMode: StartMode
    scheduledStart: number | null
    durationSeconds: number
}

export type CreateIncentiveError =
    | 'NO_ACCOUNT'
    | 'NO_POOL'
    | 'NO_REWARD_TOKEN'
    | 'REWARD_ZERO'
    | 'REWARD_INVALID'
    | 'REWARD_EXCEEDS_BALANCE'
    | 'START_MISSING'
    | 'START_IN_PAST'
    | 'START_TOO_FAR'
    | 'DURATION_ZERO'
    | 'DURATION_TOO_LONG'

/** Filters are multi-select: an empty selection means no restriction. */
export type FarmStatusFilter = 'active' | 'upcoming' | 'ended'

export type FarmOwnershipFilter = 'my-staked' | 'match-my-position'

/** My Farms is a creator's own list, so it slices by what still needs their attention. */
export type MyFarmFilter = 'ongoing' | 'unclaimed' | 'ended'

export type FarmView = 'card' | 'table'

export type FarmSortKey = 'reward-value' | 'newest' | 'opening-soon' | 'ending-soon'
