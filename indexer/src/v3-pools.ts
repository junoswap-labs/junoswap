import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { readERC20Metadata } from './erc20-read.js'
import { parseTrackingTag } from './tracking.js'
import { WRAPPED_NATIVE_ADDRESSES, STABLECOIN_ADDRESSES } from './chains.js'

const Q96 = 2n ** 96n
const WRAPPED_NATIVE = '0x700d3ba307e1256e509ed3e45d6f9dff441d6907'
const GRADUATED_FEE_TIER = 10000
const SECONDS_PER_DAY = 86400

function computePriceFromSqrtPriceX96(sqrtPriceX96: bigint, tokenIsToken0: boolean): number {
    let priceRaw: bigint
    if (tokenIsToken0) {
        priceRaw = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / (Q96 * Q96)
    } else {
        priceRaw = (Q96 * Q96 * 10n ** 18n) / (sqrtPriceX96 * sqrtPriceX96)
    }
    return Number(priceRaw) / 1e18
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertToken(
    context: any,
    chainId: number,
    address: string,
    timestamp: number
) {
    const id = `${chainId}-${address}`
    const existing = await context.db.find(schema.v3Token, { id })
    if (existing) return

    // Use standalone viem client — Ponder's context.client forces historical block numbers,
    // which fail on non-archive nodes (bitkub, kubTestnet). Token metadata is immutable,
    // so reading at latest block is always safe.
    const meta = await readERC20Metadata(chainId, address)

    await context.db
        .insert(schema.v3Token)
        .values({
            id,
            chainId,
            address,
            name: meta.name,
            symbol: meta.symbol,
            decimals: meta.decimals,
            createdAt: timestamp,
        })
        .onConflictDoNothing()
}

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

async function updateNativeUsdPrice(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    chainId: number,
    poolAddress: string,
    poolRecord: { token0: string; token1: string },
    sqrtPriceX96: bigint,
    timestamp: number,
    blockNumber: number,
    logIndex: number
) {
    const wn = WRAPPED_NATIVE_ADDRESSES[chainId]
    const stables = STABLECOIN_ADDRESSES[chainId]
    if (!wn || !stables) return

    const { token0, token1 } = poolRecord
    let nativeIsToken0 = false
    let isNativeStablePool = false

    if (token0 === wn && stables.has(token1)) {
        nativeIsToken0 = true
        isNativeStablePool = true
    } else if (token1 === wn && stables.has(token0)) {
        nativeIsToken0 = false
        isNativeStablePool = true
    }

    if (!isNativeStablePool) return

    const price = computePriceFromSqrtPriceX96(sqrtPriceX96, nativeIsToken0)

    await context.db
        .insert(schema.nativeUsdPrice)
        .values({
            chainId,
            price: price.toString(),
            poolAddress,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            price: price.toString(),
            poolAddress,
            updatedAt: timestamp,
        })

    // Append a historical point so past trades can be valued at their own rate.
    await context.db
        .insert(schema.nativeUsdPriceSnapshot)
        .values({
            id: `${chainId}-${blockNumber}-${logIndex}`,
            chainId,
            price: price.toString(),
            timestamp,
            blockNumber,
        })
        .onConflictDoNothing()
}

async function updateV3TokenSnapshot(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    chainId: number,
    poolAddress: string,
    poolRecord: { token0: string; token1: string },
    sqrtPriceX96: bigint,
    timestamp: number
) {
    const wn = WRAPPED_NATIVE_ADDRESSES[chainId]
    if (!wn) return

    const { token0, token1 } = poolRecord
    let tokenAddr: string | null = null
    let tokenIsToken0 = false

    if (token1 === wn) {
        tokenAddr = token0
        tokenIsToken0 = true
    } else if (token0 === wn) {
        tokenAddr = token1
        tokenIsToken0 = false
    }

    if (!tokenAddr) return

    const priceNative = computePriceFromSqrtPriceX96(sqrtPriceX96, tokenIsToken0)

    const nativePrice = await context.db.find(schema.nativeUsdPrice, { chainId })
    const nativeUsd = nativePrice ? parseFloat(nativePrice.price) : 0
    const priceUsd = nativeUsd > 0 ? priceNative * nativeUsd : 0

    const id = `${chainId}-${tokenAddr}`
    await context.db
        .insert(schema.v3TokenSnapshot)
        .values({
            id,
            chainId,
            tokenAddr,
            lastPriceNative: priceNative.toString(),
            lastPriceUsd: priceUsd.toString(),
            lastSwapAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            lastPriceNative: priceNative.toString(),
            lastPriceUsd: priceUsd.toString(),
            lastSwapAt: timestamp,
            updatedAt: timestamp,
        })
}

// Inserts a v3_swap_event row for a swap on any chain. The token side is
// resolved against the per-chain wrapped native; the row id is namespaced by
// chainId so block numbers (which are per-chain) can't collide across chains.
export async function recordV3SwapEvent(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    chainId: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any,
    poolRecord: { token0: string; token1: string },
    poolAddress: string,
    timestamp: number,
    // Junoswap/launchpad pools require a native leg (default true) — token/token
    // pools are skipped to protect the native-denominated PnL model. External
    // (kublerx) pools pass false to record token/token swaps for the activity feed.
    requireNative = true,
    // Liquidity source for the activity feed (dexId). Junoswap's own V3 pools keep
    // the default; the external kublerx handler passes 'kublerx'.
    protocol = 'junoswap'
) {
    const { sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick } = event.args
    const wn = WRAPPED_NATIVE_ADDRESSES[chainId]
    const { token0, token1 } = poolRecord

    let tokenAddr: string
    let tokenIsToken0: boolean
    if (token1 === wn) {
        tokenAddr = token0
        tokenIsToken0 = true
    } else if (token0 === wn) {
        tokenAddr = token1
        tokenIsToken0 = false
    } else if (requireNative) {
        // Token/token pool: no native side to value the swap against. Recording it
        // would mis-read the paired token's amount as KUB and blow up PnL, so the
        // native-denominated model skips it.
        return
    } else {
        // External pools rendered via the generalized two-leg activity display, which
        // uses token0Addr/token1Addr + amounts (not the native model). tokenAddr is a
        // best-effort default.
        tokenAddr = token0
        tokenIsToken0 = true
    }

    const tag = parseTrackingTag(event.transaction.input)
    const id = `${chainId}-${event.block.number}-${event.log.logIndex}`
    await context.db
        .insert(schema.v3SwapEvent)
        .values({
            id,
            chainId,
            poolAddress,
            tokenAddr,
            tokenIsToken0: tokenIsToken0 ? 1 : 0,
            token0Addr: token0,
            token1Addr: token1,
            sender: sender.toLowerCase(),
            recipient: recipient.toLowerCase(),
            txFrom: event.transaction.from.toLowerCase(),
            amount0: amount0.toString(),
            amount1: amount1.toString(),
            sqrtPriceX96: sqrtPriceX96.toString(),
            liquidity: liquidity.toString(),
            tick: Number(tick),
            blockNumber: Number(event.block.number),
            timestamp,
            transactionHash: event.transaction.hash,
            viaFrontend: tag ? 1 : 0,
            referrer: tag?.referrer ?? null,
            protocol,
        })
        .onConflictDoNothing()
}

// kubTestnet (25925)
ponder.on('V3Factory:PoolCreated', async ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    await Promise.all([
        upsertToken(context, 25925, t0, timestamp),
        upsertToken(context, 25925, t1, timestamp),
    ])

    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `25925-${address}`,
            chainId: 25925,
            address,
            token0: t0,
            token1: t1,
            fee: Number(fee),
            tickSpacing: Number(tickSpacing),
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
        })
        .onConflictDoNothing()
})

ponder.on('V3Pool:Swap', async ({ event, context }) => {
    const { amount0, amount1, sqrtPriceX96 } = event.args
    const poolAddress = event.log.address.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1

    // 1. Daily volume aggregation
    await upsertPoolDayVolume(context, 25925, poolAddress, timestamp, absAmount0, absAmount1)

    // 2. Get pool record (needed for all subsequent logic)
    const poolRecord = await context.db.find(schema.v3Pool, { id: `25925-${poolAddress}` })
    if (!poolRecord) return

    // 3. Update native USD price if this is a native/stablecoin pool
    await updateNativeUsdPrice(
        context,
        25925,
        poolAddress,
        poolRecord,
        sqrtPriceX96,
        timestamp,
        Number(event.block.number),
        event.log.logIndex
    )

    // 4. Update v3_token_snapshot for pools containing wrapped native
    await updateV3TokenSnapshot(context, 25925, poolAddress, poolRecord, sqrtPriceX96, timestamp)

    // 5. Insert v3_swap_event for all swaps
    await recordV3SwapEvent(context, 25925, event, poolRecord, poolAddress, timestamp)

    const { token0, token1 } = poolRecord

    // 7. Graduated launch token tracking (token_snapshot updates only for fee=10000 graduated tokens)
    if (poolRecord.fee !== GRADUATED_FEE_TIER) return

    let launchTokenAddr: string | null = null
    let launchTokenIsToken0 = false

    if (token1 === WRAPPED_NATIVE) {
        const launchToken = await context.db.find(schema.launchToken, { tokenAddr: token0 })
        if (launchToken?.isGraduated === 1) {
            launchTokenAddr = token0
            launchTokenIsToken0 = true
        }
    } else if (token0 === WRAPPED_NATIVE) {
        const launchToken = await context.db.find(schema.launchToken, { tokenAddr: token1 })
        if (launchToken?.isGraduated === 1) {
            launchTokenAddr = token1
            launchTokenIsToken0 = false
        }
    }

    if (!launchTokenAddr) return

    // Compute price and update token_snapshot
    const priceNative = computePriceFromSqrtPriceX96(sqrtPriceX96, launchTokenIsToken0)
    const marketCap = priceNative * 1_000_000_000

    const nativePriceRecord = await context.db.find(schema.nativeUsdPrice, { chainId: 25925 })
    const nativeUsd = nativePriceRecord ? parseFloat(nativePriceRecord.price) : 0
    const priceUsd = nativeUsd > 0 ? priceNative * nativeUsd : 0

    const nativeVolume = launchTokenIsToken0 ? absAmount1 : absAmount0
    const tokenAmount = launchTokenIsToken0 ? amount0 : amount1
    const isBuy = tokenAmount < 0n

    const existingSnapshot = await context.db.find(schema.tokenSnapshot, {
        tokenAddr: launchTokenAddr,
    })
    if (!existingSnapshot) return

    const athMarketCap = Math.max(
        marketCap,
        parseFloat(existingSnapshot.athMarketCapNative ?? '0')
    ).toString()

    // Compute 24h price change
    let price1dAgo: string | null = existingSnapshot.price1dAgo ?? null
    let price1dAgoTimestamp: number | null = existingSnapshot.price1dAgoTimestamp ?? null
    let priceChange1dPct: string | null = existingSnapshot.priceChange1dPct ?? null

    // At the first swap of each new UTC day, capture the reference price
    const currentDayStart = Math.floor(timestamp / 86400) * 86400
    const refDayStart = existingSnapshot.price1dAgoTimestamp
        ? Math.floor(existingSnapshot.price1dAgoTimestamp / 86400) * 86400
        : null

    if (refDayStart === null || currentDayStart > refDayStart) {
        if ((existingSnapshot.lastSwapAt ?? 0) > 0) {
            price1dAgo = existingSnapshot.lastPrice ?? '0'
            price1dAgoTimestamp = existingSnapshot.lastSwapAt ?? null
        }
    }

    if (price1dAgo !== null && price1dAgo !== '0') {
        const pastPrice = parseFloat(price1dAgo)
        if (pastPrice > 0 && priceNative > 0) {
            priceChange1dPct = (((priceNative - pastPrice) / pastPrice) * 100).toString()
        }
    }

    await context.db.update(schema.tokenSnapshot, { tokenAddr: launchTokenAddr }).set({
        lastPrice: priceNative > 0 ? priceNative.toString() : existingSnapshot.lastPrice,
        lastPriceUsd: priceUsd > 0 ? priceUsd.toString() : (existingSnapshot.lastPriceUsd ?? '0'),
        marketCapNative: marketCap.toString(),
        athMarketCapNative: athMarketCap,
        totalBuys: (existingSnapshot.totalBuys ?? 0) + (isBuy ? 1 : 0),
        totalSells: (existingSnapshot.totalSells ?? 0) + (isBuy ? 0 : 1),
        totalVolumeNative: (
            BigInt(existingSnapshot.totalVolumeNative ?? '0') + nativeVolume
        ).toString(),
        lastSwapAt: timestamp,
        price1dAgo,
        price1dAgoTimestamp,
        priceChange1dPct,
        updatedAt: timestamp,
    })
})

// bitkub mainnet (96)
ponder.on('V3FactoryBitkub:PoolCreated', async ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    await Promise.all([
        upsertToken(context, 96, t0, timestamp),
        upsertToken(context, 96, t1, timestamp),
    ])

    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `96-${address}`,
            chainId: 96,
            address,
            token0: t0,
            token1: t1,
            fee: Number(fee),
            tickSpacing: Number(tickSpacing),
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
        })
        .onConflictDoNothing()
})

ponder.on('V3PoolBitkub:Swap', async ({ event, context }) => {
    const { sqrtPriceX96 } = event.args
    const { amount0, amount1 } = event.args
    const poolAddress = event.log.address.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1

    await upsertPoolDayVolume(context, 96, poolAddress, timestamp, absAmount0, absAmount1)

    const poolRecord = await context.db.find(schema.v3Pool, { id: `96-${poolAddress}` })
    if (!poolRecord) return

    await updateNativeUsdPrice(
        context,
        96,
        poolAddress,
        poolRecord,
        sqrtPriceX96,
        timestamp,
        Number(event.block.number),
        event.log.logIndex
    )
    await updateV3TokenSnapshot(context, 96, poolAddress, poolRecord, sqrtPriceX96, timestamp)
    await recordV3SwapEvent(context, 96, event, poolRecord, poolAddress, timestamp)
})

// JBC (8899)
ponder.on('V3FactoryJbc:PoolCreated', async ({ event, context }) => {
    const { token0, token1, fee, tickSpacing, pool } = event.args
    const address = pool.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    await Promise.all([
        upsertToken(context, 8899, t0, timestamp),
        upsertToken(context, 8899, t1, timestamp),
    ])

    await context.db
        .insert(schema.v3Pool)
        .values({
            id: `8899-${address}`,
            chainId: 8899,
            address,
            token0: t0,
            token1: t1,
            fee: Number(fee),
            tickSpacing: Number(tickSpacing),
            createdAtBlock: Number(event.block.number),
            createdAtTimestamp: timestamp,
        })
        .onConflictDoNothing()
})

ponder.on('V3PoolJbc:Swap', async ({ event, context }) => {
    const { sqrtPriceX96 } = event.args
    const { amount0, amount1 } = event.args
    const poolAddress = event.log.address.toLowerCase()
    const timestamp = Number(event.block.timestamp)
    const absAmount0 = amount0 < 0n ? -amount0 : amount0
    const absAmount1 = amount1 < 0n ? -amount1 : amount1

    await upsertPoolDayVolume(context, 8899, poolAddress, timestamp, absAmount0, absAmount1)

    const poolRecord = await context.db.find(schema.v3Pool, { id: `8899-${poolAddress}` })
    if (!poolRecord) return

    await updateNativeUsdPrice(
        context,
        8899,
        poolAddress,
        poolRecord,
        sqrtPriceX96,
        timestamp,
        Number(event.block.number),
        event.log.logIndex
    )
    await updateV3TokenSnapshot(context, 8899, poolAddress, poolRecord, sqrtPriceX96, timestamp)
    await recordV3SwapEvent(context, 8899, event, poolRecord, poolAddress, timestamp)
})
