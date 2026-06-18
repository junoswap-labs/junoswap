import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { parseTrackingTag } from './tracking.js'
import { upsertToken } from './v3-pools.js'
import { getSeedV2Pool } from './seed.js'

// Resolve a pool's tokens from the DB, or lazily seed it from external-pools.json the
// first time a swap on a pre-existing pool is seen (no historical PairCreated scan).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrSeedV2Pool(context: any, chainId: number, poolAddress: string, event: any) {
    const id = `${chainId}-${poolAddress}`
    const existing = await context.db.find(schema.v2Pool, { id })
    if (existing) return existing as { token0: string; token1: string }

    const s = getSeedV2Pool(chainId, poolAddress)
    if (!s) return null

    const timestamp = Number(event.block.timestamp)
    await upsertToken(context, chainId, s.token0, timestamp)
    await upsertToken(context, chainId, s.token1, timestamp)
    await context.db
        .insert(schema.v2Pool)
        .values({
            id,
            chainId,
            address: poolAddress,
            token0: s.token0,
            token1: s.token1,
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
        })
        .onConflictDoNothing()
    return s
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordV2Pool(context: any, chainId: number, event: any) {
    const { token0, token1, pair } = event.args
    const address = pair.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    await Promise.all([
        upsertToken(context, chainId, t0, timestamp),
        upsertToken(context, chainId, t1, timestamp),
    ])

    await context.db
        .insert(schema.v2Pool)
        .values({
            id: `${chainId}-${address}`,
            chainId,
            address,
            token0: t0,
            token1: t1,
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
        })
        .onConflictDoNothing()
}

// Inserts a v2_swap_event row for a swap on a non-Junoswap V2 pair. Only swaps that
// carry the juno tracking marker (routed through our frontend) are recorded; organic
// external-DEX swaps are skipped. Both pool legs are stored (token0Addr/token1Addr)
// so the activity feed can render token/token pairs that have no native leg.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordV2SwapEvent(context: any, chainId: number, event: any, dex: string) {
    const tag = parseTrackingTag(event.transaction.input)
    if (!tag) return

    const poolAddress = event.log.address.toLowerCase()
    const poolRecord = await getOrSeedV2Pool(context, chainId, poolAddress, event)
    if (!poolRecord) return

    const { token0, token1 } = poolRecord
    const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = event.args
    const timestamp = Number(event.block.timestamp)
    const id = `${chainId}-${event.block.number}-${event.log.logIndex}`

    await context.db
        .insert(schema.v2SwapEvent)
        .values({
            id,
            chainId,
            poolAddress,
            // Legacy native-model fields kept for compatibility; the activity feed
            // uses token0Addr/token1Addr + amounts. Default to token0 when neither
            // side is decisive (token/token).
            tokenAddr: token0,
            tokenIsToken0: 1,
            token0Addr: token0,
            token1Addr: token1,
            sender: sender.toLowerCase(),
            to: to.toLowerCase(),
            txFrom: event.transaction.from.toLowerCase(),
            amount0In: amount0In.toString(),
            amount1In: amount1In.toString(),
            amount0Out: amount0Out.toString(),
            amount1Out: amount1Out.toString(),
            blockNumber: Number(event.block.number),
            timestamp,
            transactionHash: event.transaction.hash,
            viaFrontend: 1,
            referrer: tag.referrer,
            protocol: dex,
        })
        .onConflictDoNothing()
}

// Each DEX: Factory:PairCreated records pool metadata; both the Seeded (existing
// pools) and factory-discovered (new pools) Pair:Swap streams feed recordV2SwapEvent.
//
// jibswap (JBC, 8899)
ponder.on('JibswapFactory:PairCreated', async ({ event, context }) => {
    await recordV2Pool(context, 8899, event)
})
ponder.on('JibswapPairSeeded:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 8899, event, 'jibswap')
})
ponder.on('JibswapPair:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 8899, event, 'jibswap')
})

// udonswap (bitkub, 96)
ponder.on('UdonswapFactory:PairCreated', async ({ event, context }) => {
    await recordV2Pool(context, 96, event)
})
ponder.on('UdonswapPairSeeded:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'udonswap')
})
ponder.on('UdonswapPair:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'udonswap')
})

// ponder (bitkub, 96)
ponder.on('PonderFactory:PairCreated', async ({ event, context }) => {
    await recordV2Pool(context, 96, event)
})
ponder.on('PonderPairSeeded:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'ponder')
})
ponder.on('PonderPair:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'ponder')
})

// diamon (bitkub, 96)
ponder.on('DiamonFactory:PairCreated', async ({ event, context }) => {
    await recordV2Pool(context, 96, event)
})
ponder.on('DiamonPairSeeded:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'diamon')
})
ponder.on('DiamonPair:Swap', async ({ event, context }) => {
    await recordV2SwapEvent(context, 96, event, 'diamon')
})
