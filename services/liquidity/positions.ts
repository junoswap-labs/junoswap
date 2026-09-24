import { zeroAddress, type Abi, type Address, type PublicClient } from 'viem'
import {
    fetchPositionsByTokenIds,
    fetchUserPositions,
    getAbi,
    getDexes,
} from '@coshi190/juno-moneta-sdk'
import { MAX_UINT128 } from '@/types/earn'
import { ponderClient } from '@/lib/ponder-client'
import { batchRead } from '@/lib/batch-read'
import { getAmountsForLiquidity } from '@/lib/liquidity-helpers'
import { computeTickPrice, isInRange, tickToSqrtPriceX96 } from '@/lib/tick-math'

type PositionRow = Awaited<ReturnType<typeof fetchUserPositions>>[number]

export interface PositionInput {
    tokenId: bigint
    owner: string
    token0: string
    token1: string
    fee: number
    tickLower: number
    tickUpper: number
    liquidity: bigint
    tokensOwed0: bigint
    tokensOwed1: bigint
}

export interface DescribedPosition extends PositionInput {
    poolAddress: Address
    amount0: bigint
    amount1: bigint
    uncollectedFees0: bigint
    uncollectedFees1: bigint
    currentTick: number
    sqrtPriceX96: bigint
    poolLiquidity: bigint
    inRange: boolean
    priceLower: number
    priceUpper: number
    currentPrice: number
}

export interface PoolState {
    sqrtPriceX96: bigint
    tick: number
    liquidity: bigint
}

export interface PositionPoolKey {
    key: string
    token0: string
    token1: string
    fee: number
}

export interface PositionFees {
    fees0: bigint
    fees1: bigint
}

export function rowToPositionInput(row: PositionRow): PositionInput {
    return {
        tokenId: BigInt(row.tokenId),
        owner: row.owner,
        token0: row.token0,
        token1: row.token1,
        fee: row.fee,
        tickLower: row.tickLower,
        tickUpper: row.tickUpper,
        liquidity: BigInt(row.liquidity),
        tokensOwed0: BigInt(row.tokensOwed0),
        tokensOwed1: BigInt(row.tokensOwed1),
    }
}

function poolKeyOf(token0: string, token1: string, fee: number): string {
    return `${token0.toLowerCase()}-${token1.toLowerCase()}-${fee}`
}

export function buildPositionPoolKeys(positions: readonly PositionInput[]): PositionPoolKey[] {
    const seen = new Map<string, PositionPoolKey>()
    for (const p of positions) {
        const key = poolKeyOf(p.token0, p.token1, p.fee)
        if (!seen.has(key)) seen.set(key, { key, token0: p.token0, token1: p.token1, fee: p.fee })
    }
    return [...seen.values()]
}

export interface FoldPositionsParams {
    positions: readonly PositionInput[]
    /** Pool address by pool key. */
    poolAddresses: Map<string, Address>
    /** Pool state by lowercased pool address. */
    poolStates: Map<string, PoolState>
    /** Token decimals by lowercased token address; unknown tokens are treated as 18. */
    decimals?: Map<string, number>
    /** Simulated collect() output by tokenId; positions without one fall back to tokensOwed. */
    fees?: Map<string, PositionFees>
}

/**
 * A position whose pool couldn't be resolved or read keeps its range prices but values at zero
 * and reads as out of range, rather than being dropped from the list.
 */
export function foldPositions(params: FoldPositionsParams): DescribedPosition[] {
    return params.positions.map((position) => {
        const poolAddress = params.poolAddresses.get(
            poolKeyOf(position.token0, position.token1, position.fee)
        )
        const state = poolAddress ? params.poolStates.get(poolAddress.toLowerCase()) : undefined

        const decimals0 = params.decimals?.get(position.token0.toLowerCase()) ?? 18
        const decimals1 = params.decimals?.get(position.token1.toLowerCase()) ?? 18

        const amounts = state
            ? getAmountsForLiquidity(
                  state.sqrtPriceX96,
                  tickToSqrtPriceX96(position.tickLower),
                  tickToSqrtPriceX96(position.tickUpper),
                  position.liquidity
              )
            : { amount0: 0n, amount1: 0n }

        const currentTick = state?.tick ?? position.tickLower
        const fees = params.fees?.get(position.tokenId.toString())

        return {
            ...position,
            poolAddress: poolAddress ?? zeroAddress,
            amount0: amounts.amount0,
            amount1: amounts.amount1,
            uncollectedFees0: fees?.fees0 ?? position.tokensOwed0,
            uncollectedFees1: fees?.fees1 ?? position.tokensOwed1,
            currentTick,
            sqrtPriceX96: state?.sqrtPriceX96 ?? 0n,
            poolLiquidity: state?.liquidity ?? 0n,
            inRange: state ? isInRange(currentTick, position.tickLower, position.tickUpper) : false,
            priceLower: computeTickPrice({ tick: position.tickLower, decimals0, decimals1 }),
            priceUpper: computeTickPrice({ tick: position.tickUpper, decimals0, decimals1 }),
            currentPrice: state ? computeTickPrice({ tick: currentTick, decimals0, decimals1 }) : 0,
        }
    })
}

async function readPoolAddresses(
    client: PublicClient,
    factory: Address,
    keys: readonly PositionPoolKey[]
): Promise<Map<string, Address>> {
    const results = await batchRead(
        client,
        keys.map((k) => ({
            address: factory,
            abi: getAbi('v3Factory') as Abi,
            functionName: 'getPool',
            args: [k.token0, k.token1, k.fee],
        }))
    )
    const map = new Map<string, Address>()
    keys.forEach((k, i) => {
        const address = results[i] as Address | undefined
        if (address && address !== zeroAddress) map.set(k.key, address)
    })
    return map
}

async function readPoolStates(
    client: PublicClient,
    pools: readonly Address[]
): Promise<Map<string, PoolState>> {
    const abi = getAbi('v3Pool') as Abi
    const results = await batchRead(
        client,
        pools.flatMap((pool) => [
            { address: pool, abi, functionName: 'slot0', args: [] },
            { address: pool, abi, functionName: 'liquidity', args: [] },
        ])
    )
    const map = new Map<string, PoolState>()
    pools.forEach((pool, i) => {
        const slot0 = results[i * 2] as readonly [bigint, number, ...unknown[]] | undefined
        if (!slot0) return
        map.set(pool.toLowerCase(), {
            sqrtPriceX96: slot0[0],
            tick: slot0[1],
            liquidity: (results[i * 2 + 1] as bigint | undefined) ?? 0n,
        })
    })
    return map
}

/** Uncollected fees are only known by simulating collect() as the owner. */
async function simulateFees(
    client: PublicClient,
    positionManager: Address,
    positions: readonly PositionInput[]
): Promise<Map<string, PositionFees>> {
    const settled = await Promise.allSettled(
        positions.map((p) =>
            client.simulateContract({
                address: positionManager,
                abi: getAbi('positionManager'),
                functionName: 'collect',
                account: p.owner as Address,
                args: [
                    {
                        tokenId: p.tokenId,
                        recipient: p.owner as Address,
                        amount0Max: MAX_UINT128,
                        amount1Max: MAX_UINT128,
                    },
                ],
            })
        )
    )
    const map = new Map<string, PositionFees>()
    settled.forEach((outcome, i) => {
        if (outcome.status !== 'fulfilled') return
        const [fees0, fees1] = outcome.value.result as readonly [bigint, bigint]
        map.set(positions[i]!.tokenId.toString(), { fees0, fees1 })
    })
    return map
}

export interface DescribePositionsParams {
    chainId: number
    owner?: string
    tokenIds?: bigint[]
    /** Describe these directly instead of loading them from the indexer. */
    positions?: PositionInput[]
    decimals?: Map<string, number>
}

export async function describePositions(
    client: PublicClient,
    params: DescribePositionsParams
): Promise<DescribedPosition[]> {
    const dex = getDexes(params.chainId, 'v3')[0]
    if (!dex) return []

    let positions = params.positions
    if (!positions) {
        const rows = params.owner
            ? await fetchUserPositions(ponderClient, {
                  chainId: params.chainId,
                  owner: params.owner,
              })
            : await fetchPositionsByTokenIds(ponderClient, {
                  chainId: params.chainId,
                  tokenIds: params.tokenIds ?? [],
              })
        positions = rows.map(rowToPositionInput)
    }
    if (positions.length === 0) return []

    const poolAddresses = await readPoolAddresses(
        client,
        dex.factory,
        buildPositionPoolKeys(positions)
    )
    const [poolStates, fees] = await Promise.all([
        readPoolStates(client, [...new Set(poolAddresses.values())]),
        dex.positionManager
            ? simulateFees(client, dex.positionManager, positions)
            : Promise.resolve(undefined),
    ])

    return foldPositions({
        positions,
        poolAddresses,
        poolStates,
        ...(params.decimals ? { decimals: params.decimals } : {}),
        ...(fees ? { fees } : {}),
    })
}
