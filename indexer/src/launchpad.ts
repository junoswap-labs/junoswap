import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { formatEther } from 'viem'
import { readERC20Metadata } from './erc20-read.js'

const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n
const _VIRTUAL_AMOUNT = 3400n * 10n ** 18n

function calculatePriceFromReserves(isBuy: boolean, reserveIn: bigint, reserveOut: bigint): number {
    const nativeReserve = isBuy ? reserveIn : reserveOut
    const tokenReserve = isBuy ? reserveOut : reserveIn
    if (nativeReserve === 0n || tokenReserve === 0n) return 0
    const effectiveReserve = parseFloat(formatEther(nativeReserve + _VIRTUAL_AMOUNT))
    const tokenRes = parseFloat(formatEther(tokenReserve))
    if (tokenRes === 0) return 0
    return effectiveReserve / tokenRes
}

function calculateMarketCapFromReserves(
    isBuy: boolean,
    reserveIn: bigint,
    reserveOut: bigint
): string {
    if (reserveIn === 0n || reserveOut === 0n) return '0'
    const nativeReserve = isBuy ? reserveIn : reserveOut
    const tokenReserve = isBuy ? reserveOut : reserveIn
    const effectiveReserve = nativeReserve + _VIRTUAL_AMOUNT
    const marketCap = (effectiveReserve * TOTAL_SUPPLY) / tokenReserve
    return formatEther(marketCap)
}

function calculateVolume(isBuy: boolean, amountIn: bigint, amountOut: bigint): bigint {
    return isBuy ? amountIn : amountOut
}

// Default snapshot values (used when creating a new snapshot)
function defaultSnapshot(tokenAddr: string) {
    return {
        tokenAddr,
        lastPrice: '0',
        lastPriceUsd: '0',
        marketCapNative: '0',
        athMarketCapNative: '0',
        totalBuys: 0,
        totalSells: 0,
        totalVolumeNative: '0',
        holderCount: 0,
        lastSwapAt: 0,
        price1dAgo: null as string | null,
        price1dAgoTimestamp: null as number | null,
        priceChange1dPct: null as string | null,
        updatedAt: 0,
    }
}

ponder.on('PumpCoreNative:Creation', async ({ event, context }) => {
    const { creator, tokenAddr, logo, description, link1, link2, link3, createdTime } = event.args
    const tokenAddrLower = tokenAddr.toLowerCase()

    // Use standalone viem client — Ponder's context.client forces historical block numbers
    const meta = await readERC20Metadata(25925, tokenAddrLower)

    await context.db
        .insert(schema.launchToken)
        .values({
            tokenAddr: tokenAddrLower,
            creator: creator.toLowerCase(),
            name: meta.name,
            symbol: meta.symbol,
            logo: logo ?? '',
            description: description ?? '',
            link1: link1 ?? '',
            link2: link2 ?? '',
            link3: link3 ?? '',
            createdTime: Number(createdTime ?? 0),
            isGraduated: 0,
            graduatedAt: null,
            createdAtBlock: Number(event.block.number),
        })
        .onConflictDoNothing()
})

ponder.on('PumpCoreNative:Swap', async ({ event, context }) => {
    const { sender, isBuy, tokenAddr, amountIn, amountOut, reserveIn, reserveOut } = event.args
    const tokenAddrLower = tokenAddr.toLowerCase()
    const senderLower = sender.toLowerCase()
    const id = `${event.block.number}-${event.log.logIndex}`
    const timestamp = Number(event.block.timestamp)

    // 1. Insert swap event
    await context.db.insert(schema.swapEvent).values({
        id,
        tokenAddr: tokenAddrLower,
        sender: senderLower,
        isBuy: isBuy ? 1 : 0,
        amountIn: amountIn.toString(),
        amountOut: amountOut.toString(),
        reserveIn: reserveIn.toString(),
        reserveOut: reserveOut.toString(),
        blockNumber: Number(event.block.number),
        timestamp,
        transactionHash: event.transaction.hash,
    })

    const price = calculatePriceFromReserves(isBuy, BigInt(reserveIn), BigInt(reserveOut))
    const marketCap = calculateMarketCapFromReserves(isBuy, BigInt(reserveIn), BigInt(reserveOut))
    const volume = calculateVolume(isBuy, amountIn, amountOut)

    // 2. Read native USD price for USD conversion
    const nativePriceRecord = await context.db.find(schema.nativeUsdPrice, { chainId: 25925 })
    const nativeUsd = nativePriceRecord ? parseFloat(nativePriceRecord.price) : 0
    const priceUsd = nativeUsd > 0 && price > 0 ? price * nativeUsd : 0

    // 3. Read current snapshot (from previous events), or use defaults
    const existingSnapshot = await context.db.find(schema.tokenSnapshot, {
        tokenAddr: tokenAddrLower,
    })
    const snap = existingSnapshot ?? defaultSnapshot(tokenAddrLower)
    const isNewSnapshot = !existingSnapshot

    const athMarketCap = Math.max(
        parseFloat(marketCap),
        parseFloat(snap.athMarketCapNative ?? '0')
    ).toString()

    // 4. Read current holder state
    const holderId = `${tokenAddrLower}-${senderLower}`
    const existingHolder = await context.db.find(schema.tokenHolder, { id: holderId })
    const oldBalance = existingHolder ? BigInt(existingHolder.balance) : 0n
    const isNewHolder = !existingHolder

    // 5. Compute new values
    const balanceChange = isBuy ? amountOut : -amountIn
    const newBalance = oldBalance + balanceChange

    // 5b. Compute 24h price change
    let price1dAgo: string | null = snap.price1dAgo ?? null
    let price1dAgoTimestamp: number | null = snap.price1dAgoTimestamp ?? null
    let priceChange1dPct: string | null = snap.priceChange1dPct ?? null

    // At the first swap of each new UTC day, capture the reference price
    const currentDayStart = Math.floor(timestamp / 86400) * 86400
    const refDayStart = snap.price1dAgoTimestamp
        ? Math.floor(snap.price1dAgoTimestamp / 86400) * 86400
        : null

    if (refDayStart === null || currentDayStart > refDayStart) {
        if ((snap.lastSwapAt ?? 0) > 0) {
            price1dAgo = snap.lastPrice ?? '0'
            price1dAgoTimestamp = snap.lastSwapAt ?? null
        }
    }

    if (price1dAgo !== null && price1dAgo !== '0') {
        const pastPrice = parseFloat(price1dAgo)
        if (pastPrice > 0 && price > 0) {
            priceChange1dPct = (((price - pastPrice) / pastPrice) * 100).toString()
        }
    }

    let holderCount = snap.holderCount ?? 0
    const oldPositive = oldBalance > 0n
    const newPositive = newBalance > 0n
    if (!oldPositive && newPositive) holderCount += 1
    if (oldPositive && !newPositive) holderCount = Math.max(0, holderCount - 1)

    // 6. Write all updates
    if (isNewSnapshot) {
        await context.db
            .insert(schema.tokenSnapshot)
            .values({
                tokenAddr: tokenAddrLower,
                lastPrice: price > 0 ? price.toString() : '0',
                lastPriceUsd: priceUsd > 0 ? priceUsd.toString() : '0',
                marketCapNative: marketCap,
                athMarketCapNative: athMarketCap,
                totalBuys: isBuy ? 1 : 0,
                totalSells: isBuy ? 0 : 1,
                totalVolumeNative: volume.toString(),
                holderCount,
                lastSwapAt: timestamp,
                price1dAgo,
                price1dAgoTimestamp,
                priceChange1dPct,
                updatedAt: timestamp,
            })
            .onConflictDoNothing()
    } else {
        await context.db.update(schema.tokenSnapshot, { tokenAddr: tokenAddrLower }).set({
            lastPrice: price > 0 ? price.toString() : (snap.lastPrice ?? '0'),
            lastPriceUsd: priceUsd > 0 ? priceUsd.toString() : (snap.lastPriceUsd ?? '0'),
            marketCapNative: marketCap,
            athMarketCapNative: athMarketCap,
            totalBuys: (snap.totalBuys ?? 0) + (isBuy ? 1 : 0),
            totalSells: (snap.totalSells ?? 0) + (isBuy ? 0 : 1),
            totalVolumeNative: (BigInt(snap.totalVolumeNative ?? '0') + volume).toString(),
            holderCount,
            lastSwapAt: timestamp,
            price1dAgo,
            price1dAgoTimestamp,
            priceChange1dPct,
            updatedAt: timestamp,
        })
    }

    if (isNewHolder) {
        await context.db
            .insert(schema.tokenHolder)
            .values({
                id: holderId,
                tokenAddr: tokenAddrLower,
                address: senderLower,
                balance: newBalance.toString(),
            })
            .onConflictDoNothing()
    } else {
        await context.db.update(schema.tokenHolder, { id: holderId }).set({
            balance: newBalance.toString(),
        })
    }
})

ponder.on('PumpCoreNative:Graduation', async ({ event, context }) => {
    const { tokenAddr } = event.args

    await context.db.update(schema.launchToken, { tokenAddr: tokenAddr.toLowerCase() }).set({
        isGraduated: 1,
        graduatedAt: Number(event.block.timestamp),
    })
})
