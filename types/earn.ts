import type { Address } from 'viem'
import type { Token } from './tokens'

// ============ Position Types ============

/**
 * Raw V3 position data from the NonfungiblePositionManager contract
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

/**
 * V3 position enriched with token information
 */
export interface PositionWithTokens extends V3Position {
    token0Info: Token
    token1Info: Token
    poolAddress: Address
    inRange: boolean
    amount0: bigint
    amount1: bigint
    uncollectedFees0: bigint
    uncollectedFees1: bigint
}

/**
 * Full position details including current pool state
 */
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

// ============ Pool Types ============

/**
 * V3 pool data
 */
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

// ============ Liquidity Operation Types ============

/**
 * Parameters for creating a new liquidity position
 */
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

/**
 * Parameters for increasing liquidity on an existing position
 */
export interface IncreaseLiquidityParams {
    tokenId: bigint
    amount0Desired: bigint
    amount1Desired: bigint
    slippageTolerance: number
    deadline: number
}

/**
 * Parameters for removing liquidity from a position
 */
export interface RemoveLiquidityParams {
    tokenId: bigint
    liquidity: bigint
    amount0Min: bigint
    amount1Min: bigint
    deadline: number
    collectFees: boolean
}

/**
 * Parameters for collecting fees from a position
 */
export interface CollectFeesParams {
    tokenId: bigint
    recipient: Address
    amount0Max: bigint
    amount1Max: bigint
}

// ============ Range Selection Types ============

/**
 * Range preset options for concentrated liquidity
 */
export type RangePreset = 'full' | 'safe' | 'common' | 'narrow' | 'custom'

/**
 * Range configuration for a position
 */
export interface RangeConfig {
    preset: RangePreset
    tickLower: number
    tickUpper: number
    priceLower: string
    priceUpper: string
}

/**
 * Range preset configuration
 */
interface RangePresetConfig {
    label: string
    value: RangePreset
    description: string
    tickRange?: number // Percentage of ticks from current (e.g., 50 means ±50% from current)
}

// ============ Contract Call Types ============

/**
 * Mint call parameters (matches NonfungiblePositionManager.mint)
 */
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

/**
 * IncreaseLiquidity call parameters
 */
export interface IncreaseLiquidityCallParams {
    tokenId: bigint
    amount0Desired: bigint
    amount1Desired: bigint
    amount0Min: bigint
    amount1Min: bigint
    deadline: bigint
}

/**
 * DecreaseLiquidity call parameters
 */
export interface DecreaseLiquidityCallParams {
    tokenId: bigint
    liquidity: bigint
    amount0Min: bigint
    amount1Min: bigint
    deadline: bigint
}

/**
 * Collect call parameters
 */
export interface CollectCallParams {
    tokenId: bigint
    recipient: Address
    amount0Max: bigint
    amount1Max: bigint
}

// ============ Store Types ============

/**
 * Earn feature settings (persisted)
 */
export interface EarnSettings {
    defaultSlippage: number // basis points
    defaultDeadlineMinutes: number
    hideClosedPositions: boolean
    showAllPools: boolean
}

// ============ Constants ============

/**
 * Maximum uint128 value for collecting all fees
 */
export const MAX_UINT128 = 2n ** 128n - 1n

/**
 * Tick spacing by fee tier
 */
export const TICK_SPACING: Record<number, number> = {
    100: 1, // 0.01%
    500: 10, // 0.05%
    2500: 50, // 0.25% (PancakeSwap)
    3000: 60, // 0.3%
    10000: 200, // 1%
}

/**
 * Default range presets
 */
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

/**
 * Default earn settings
 */
export const DEFAULT_EARN_SETTINGS: EarnSettings = {
    defaultSlippage: 50, // 0.5%
    defaultDeadlineMinutes: 20,
    hideClosedPositions: false,
    showAllPools: true,
}

/**
 * Default range config
 */
export const DEFAULT_RANGE_CONFIG: RangeConfig = {
    preset: 'common',
    tickLower: 0,
    tickUpper: 0,
    priceLower: '0',
    priceUpper: '0',
}

// ============ Staking/Mining Types ============

/**
 * IncentiveKey structure matching V3 Staker contract
 */
export interface IncentiveKey {
    rewardToken: Address
    pool: Address
    startTime: number
    endTime: number
    refundee: Address
}

/**
 * Incentive data with computed fields
 */
export interface Incentive extends IncentiveKey {
    incentiveId: `0x${string}` // keccak256 hash of IncentiveKey
    totalRewardUnclaimed: bigint
    totalSecondsClaimedX128: bigint
    numberOfStakes: number
    // Enriched token info
    rewardTokenInfo: Token
    poolToken0: Token
    poolToken1: Token
    poolFee: number
    // Status
    isActive: boolean
    isEnded: boolean
}

/**
 * User's staked position in an incentive
 */
export interface StakedPosition {
    tokenId: bigint
    incentiveId: `0x${string}`
    liquidity: bigint
    secondsPerLiquidityInsideInitialX128: bigint
    // Enriched data
    position: PositionWithTokens
    incentive: Incentive
    pendingRewards: bigint
}

/**
 * Deposit info from V3 Staker contract
 */
export interface DepositInfo {
    owner: Address
    numberOfStakes: number
    tickLower: number
    tickUpper: number
}

/**
 * Parameters for unstaking a position
 */
export interface UnstakeParams {
    tokenId: bigint
    incentiveKey: IncentiveKey
}

/**
 * Mining settings (persisted)
 */
export interface MiningSettings {
    hideEndedIncentives: boolean
}

/**
 * Default mining settings
 */
export const DEFAULT_MINING_SETTINGS: MiningSettings = {
    hideEndedIncentives: true,
}
