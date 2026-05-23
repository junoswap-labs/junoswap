import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'

const SECONDS_PER_DAY = 86400

function getDayTimestamp(timestamp: number): number {
    return Math.floor(timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY
}

// Shared volume aggregation logic — context type inferred by each inline handler
async function upsertPoolDayVolume(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    chainId: number,
    poolAddress: string,
    timestamp: number,
    absAmount0: bigint,
    absAmount1: bigint
) {
    const dayTimestamp = getDayTimestamp(timestamp)
    const dayId = `${chainId}-${poolAddress}-${dayTimestamp}`

    const existing = await context.db.find(schema.v3PoolDayVolume, { id: dayId })

    if (!existing) {
        await context.db
            .insert(schema.v3PoolDayVolume)
            .values({
                id: dayId,
                chainId,
                poolAddress,
                dayTimestamp,
                volumeToken0: absAmount0.toString(),
                volumeToken1: absAmount1.toString(),
                swapCount: 1,
                updatedAt: timestamp,
            })
            .onConflictDoNothing()
    } else {
        const newVol0 = BigInt(existing.volumeToken0) + absAmount0
        const newVol1 = BigInt(existing.volumeToken1) + absAmount1

        await context.db.update(schema.v3PoolDayVolume, { id: dayId }).set({
            volumeToken0: newVol0.toString(),
            volumeToken1: newVol1.toString(),
            swapCount: existing.swapCount + 1,
            updatedAt: timestamp,
        })
    }
}

// kubTestnet (25925)
ponder.on('V3Factory:PoolCreated', async ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `25925-${address}`,
            chainId: 25925,
            address,
            token0: token0.toLowerCase(),
            token1: token1.toLowerCase(),
            fee: Number(fee),
            tickSpacing: Number(tickSpacing),
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: Number(event.block.timestamp),
        })
        .onConflictDoNothing()
})

ponder.on('V3Pool:Swap', async ({ event, context }) => {
    const { amount0, amount1 } = event.args
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1
    await upsertPoolDayVolume(
        context,
        25925,
        event.log.address.toLowerCase(),
        Number(event.block.timestamp),
        absAmount0,
        absAmount1
    )
})

// bitkub mainnet (96)
ponder.on('V3FactoryBitkub:PoolCreated', async ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `96-${address}`,
            chainId: 96,
            address,
            token0: token0.toLowerCase(),
            token1: token1.toLowerCase(),
            fee: Number(fee),
            tickSpacing: Number(tickSpacing),
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: Number(event.block.timestamp),
        })
        .onConflictDoNothing()
})

ponder.on('V3PoolBitkub:Swap', async ({ event, context }) => {
    const { amount0, amount1 } = event.args
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1
    await upsertPoolDayVolume(
        context,
        96,
        event.log.address.toLowerCase(),
        Number(event.block.timestamp),
        absAmount0,
        absAmount1
    )
})

// JBC (8899)
ponder.on('V3FactoryJbc:PoolCreated', async ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `8899-${address}`,
            chainId: 8899,
            address,
            token0: token0.toLowerCase(),
            token1: token1.toLowerCase(),
            fee: Number(fee),
            tickSpacing: Number(tickSpacing),
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: Number(event.block.timestamp),
        })
        .onConflictDoNothing()
})

ponder.on('V3PoolJbc:Swap', async ({ event, context }) => {
    const { amount0, amount1 } = event.args
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1
    await upsertPoolDayVolume(
        context,
        8899,
        event.log.address.toLowerCase(),
        Number(event.block.timestamp),
        absAmount0,
        absAmount1
    )
})
