import type { Address } from 'viem'
import type { Token } from './tokens'

/**
 * Raw V3 position data straight from the NonfungiblePositionManager contract.
 * Enriched into PositionWithTokens, then PositionDetails (adds live pool state).
 */
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
    deadline: number
    collectFees: boolean
}

export interface CollectFeesParams {
    tokenId: bigint
    recipient: Address
    amount0Max: bigint
    amount1Max: bigint
}

export type RangePreset = 'full' | 'safe' | 'common' | 'narrow' | 'custom'

export interface RangeConfig {
    preset: RangePreset
    tickLower: number
    tickUpper: number
    priceLower: string
    priceUpper: string
}

interface RangePresetConfig {
    label: string
    value: RangePreset
    description: string
    tickRange?: number // Percentage of ticks from current (e.g., 50 means ±50% from current)
}

/** Mirrors the NonfungiblePositionManager.mint argument struct. */
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

/** Passed as amount0Max/amount1Max to collect all accrued fees. */
export const MAX_UINT128 = 2n ** 128n - 1n

export const TICK_SPACING: Record<number, number> = {
    100: 1, // 0.01%
    500: 10, // 0.05%
    2500: 50, // 0.25% (PancakeSwap)
    3000: 60, // 0.3%
    10000: 200, // 1%
}

export const RANGE_PRESETS: RangePresetConfig[] = [
    {
        label: 'Full Range',
        value: 'full',
        description: 'Earn fees at any price (like V2)',
    },
    {
        label: 'Safe',
        value: 'safe',
        description: '±50% from current price',
        tickRange: 50,
    },
    {
        label: 'Common',
        value: 'common',
        description: '±20% from current price',
        tickRange: 20,
    },
    {
        label: 'Narrow',
        value: 'narrow',
        description: '±5% for stable pairs',
        tickRange: 5,
    },
    {
        label: 'Custom',
        value: 'custom',
        description: 'Set your own range',
    },
]

export const DEFAULT_RANGE_CONFIG: RangeConfig = {
    preset: 'common',
    tickLower: 0,
    tickUpper: 0,
    priceLower: '0',
    priceUpper: '0',
}

/** Matches the IncentiveKey struct in the V3 Staker contract. */
export interface IncentiveKey {
    rewardToken: Address
    pool: Address
    startTime: number
    endTime: number
    refundee: Address
}

export interface Incentive extends IncentiveKey {
    incentiveId: `0x${string}` // keccak256 hash of IncentiveKey
    totalRewardUnclaimed: bigint
    totalSecondsClaimedX128: bigint
    numberOfStakes: number
    rewardTokenInfo: Token
    poolToken0: Token
    poolToken1: Token
    poolFee: number
    isActive: boolean
    isEnded: boolean
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
