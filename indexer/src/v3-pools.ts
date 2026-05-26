import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'

const Q96 = 2n ** 96n
const WRAPPED_NATIVE = '0x700d3ba307e1256e509ed3e45d6f9dff441d6907'
const GRADUATED_FEE_TIER = 10000
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
    const { sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick } = event.args
    const poolAddress = event.log.address.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1

    // 1. Existing: daily volume aggregation
    await upsertPoolDayVolume(context, 25925, poolAddress, timestamp, absAmount0, absAmount1)

    // 2. Check if this pool contains a graduated launch token
    const poolRecord = await context.db.find(schema.v3Pool, { id: `25925-${poolAddress}` })
    if (!poolRecord || poolRecord.fee !== GRADUATED_FEE_TIER) return

    const { token0, token1 } = poolRecord
    let launchTokenAddr: string | null = null
    let tokenIsToken0 = false

    if (token1 === WRAPPED_NATIVE) {
        const launchToken = await context.db.find(schema.launchToken, { tokenAddr: token0 })
        if (launchToken?.isGraduated === 1) {
            launchTokenAddr = token0
            tokenIsToken0 = true
        }
    } else if (token0 === WRAPPED_NATIVE) {
        const launchToken = await context.db.find(schema.launchToken, { tokenAddr: token1 })
        if (launchToken?.isGraduated === 1) {
            launchTokenAddr = token1
            tokenIsToken0 = false
        }
    }

    if (!launchTokenAddr) return

    // 3. Insert v3_swap_event
    const id = `v3-${event.block.number}-${event.log.logIndex}`
    await context.db
        .insert(schema.v3SwapEvent)
        .values({
            id,
            poolAddress,
            tokenAddr: launchTokenAddr,
            sender: sender.toLowerCase(),
            recipient: recipient.toLowerCase(),
            amount0: amount0.toString(),
            amount1: amount1.toString(),
            sqrtPriceX96: sqrtPriceX96.toString(),
            liquidity: liquidity.toString(),
            tick: Number(tick),
            blockNumber: Number(event.block.number),
            timestamp,
            transactionHash: event.transaction.hash,
        })
        .onConflictDoNothing()

    // 4. Compute price from sqrtPriceX96 and update token_snapshot
    let priceRaw: bigint
    if (tokenIsToken0) {
        priceRaw = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / (Q96 * Q96)
    } else {
        priceRaw = (Q96 * Q96 * 10n ** 18n) / (sqrtPriceX96 * sqrtPriceX96)
    }
    const priceNative = Number(priceRaw) / 1e18
    const marketCap = priceNative * 1_000_000_000

    const nativeVolume = tokenIsToken0 ? absAmount1 : absAmount0
    const tokenAmount = tokenIsToken0 ? amount0 : amount1
    const isBuy = tokenAmount < 0n

    const existingSnapshot = await context.db.find(schema.tokenSnapshot, {
        tokenAddr: launchTokenAddr,
    })
    if (!existingSnapshot) return

    const athMarketCap = Math.max(
        marketCap,
        parseFloat(existingSnapshot.athMarketCapNative ?? '0')
    ).toString()

    await context.db.update(schema.tokenSnapshot, { tokenAddr: launchTokenAddr }).set({
        lastPrice: priceNative > 0 ? priceNative.toString() : existingSnapshot.lastPrice,
        marketCapNative: marketCap.toString(),
        athMarketCapNative: athMarketCap,
        totalBuys: (existingSnapshot.totalBuys ?? 0) + (isBuy ? 1 : 0),
        totalSells: (existingSnapshot.totalSells ?? 0) + (isBuy ? 0 : 1),
        totalVolumeNative: (
            BigInt(existingSnapshot.totalVolumeNative ?? '0') + nativeVolume
        ).toString(),
        lastSwapAt: timestamp,
        updatedAt: timestamp,
    })
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
