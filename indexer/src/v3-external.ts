import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { upsertToken, recordV3SwapEvent } from './v3-pools.js'
import { parseTrackingTag } from './tracking.js'
import { getSeedV3Pool } from './seed.js'

// External (non-Junoswap) Uniswap-V3-style pools on chains the indexer already
// runs. These are tracked purely for swap attribution (the calldata referrer tag):
// we record pool metadata + swap events, but deliberately skip the native-USD-price
// and v3_token_snapshot updates, which are reserved for Junoswap/launchpad pools and
// would otherwise corrupt launchpad pricing if an external pool overwrote them.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordExternalV3Pool(context: any, chainId: number, event: any) {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    await Promise.all([
        upsertToken(context, chainId, t0, timestamp),
        upsertToken(context, chainId, t1, timestamp),
    ])

    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `${chainId}-${address}`,
            chainId,
            address,
            token0: t0,
            token1: t1,
            fee: Number(fee),
            tickSpacing: Number(tickSpacing),
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
        })
        .onConflictDoNothing()
}

// Lazily insert a pre-existing kublerx pool from external-pools.json (no historical
// PoolCreated scan), mirroring getOrSeedV2Pool.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrSeedKublerxPool(context: any, poolAddress: string, event: any) {
    const id = `96-${poolAddress}`
    const existing = await context.db.find(schema.v3Pool, { id })
    if (existing) return existing as { token0: string; token1: string }

    const s = getSeedV3Pool(96, poolAddress)
    if (!s) return null

    const timestamp = Number(event.block.timestamp)
    await upsertToken(context, 96, s.token0, timestamp)
    await upsertToken(context, 96, s.token1, timestamp)
    await context.db
        .insert(schema.v3Pool)
        .values({
            id,
            chainId: 96,
            address: poolAddress,
            token0: s.token0,
            token1: s.token1,
            fee: s.fee,
            tickSpacing: s.tickSpacing,
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
        })
        .onConflictDoNothing()
    return s
}

// Only record kublerx swaps that came through our frontend (carry the juno marker).
// The guard lives here, not in recordV3SwapEvent, because Junoswap's own pool
// handlers share that function and must record every swap. requireNative=false so
// token/token kublerx swaps are recorded for the activity feed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordKublerxSwap(context: any, event: any) {
    if (!parseTrackingTag(event.transaction.input)) return
    const poolAddress = event.log.address.toLowerCase()
    const poolRecord = await getOrSeedKublerxPool(context, poolAddress, event)
    if (!poolRecord) return
    await recordV3SwapEvent(
        context,
        96,
        event,
        poolRecord,
        poolAddress,
        Number(event.block.timestamp),
        false,
        'kublerx'
    )
}

// kublerx (bitkub, 96)
ponder.on('KublerxV3Factory:PoolCreated', async ({ event, context }) => {
    await recordExternalV3Pool(context, 96, event)
})
// Existing pools (seeded) + pools created after rollout (factory-discovered).
ponder.on('KublerxV3PoolSeeded:Swap', async ({ event, context }) => {
    await recordKublerxSwap(context, event)
})
ponder.on('KublerxV3Pool:Swap', async ({ event, context }) => {
    await recordKublerxSwap(context, event)
})
