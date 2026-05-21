import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { formatEther } from 'viem'

const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n
const VIRTUAL_AMOUNT = 3400n * 10n ** 18n

function calculatePrice(isBuy: boolean, amountIn: bigint, amountOut: bigint): number {
    if (amountIn === 0n || amountOut === 0n) return 0
    const inNum = parseFloat(formatEther(amountIn))
    const outNum = parseFloat(formatEther(amountOut))
    if (outNum === 0 || inNum === 0) return 0
    return isBuy ? inNum / outNum : outNum / inNum
}

function calculateMarketCap(
    nativeReserve: bigint,
    tokenReserve: bigint,
    virtualAmount: bigint
): string {
    const effectiveReserve = virtualAmount + nativeReserve
    const circulatingSupply = TOTAL_SUPPLY - tokenReserve
    if (circulatingSupply <= 0n) return '0'
    const marketCap = (effectiveReserve * TOTAL_SUPPLY) / circulatingSupply
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
        marketCapNative: '0',
        totalBuys: 0,
        totalSells: 0,
        totalVolumeNative: '0',
        holderCount: 0,
        lastSwapAt: 0,
        updatedAt: 0,
    }
}

ponder.on('PumpCoreNative:Creation', async ({ event, context }) => {
    const { creator, tokenAddr, logo, description, link1, link2, link3, createdTime } = event.args

    await context.db
        .insert(schema.launchToken)
        .values({
            tokenAddr: tokenAddr.toLowerCase(),
            creator: creator.toLowerCase(),
            name: '',
            symbol: '',
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

    const price = calculatePrice(isBuy, amountIn, amountOut)
    const marketCap = calculateMarketCap(reserveIn, reserveOut, VIRTUAL_AMOUNT)
    const volume = calculateVolume(isBuy, amountIn, amountOut)

    // 2. Read current snapshot (from previous events), or use defaults
    const existingSnapshot = await context.db.find(schema.tokenSnapshot, {
        tokenAddr: tokenAddrLower,
    })
    const snap = existingSnapshot ?? defaultSnapshot(tokenAddrLower)
    const isNewSnapshot = !existingSnapshot

    // 3. Read current holder state
    const holderId = `${tokenAddrLower}-${senderLower}`
    const existingHolder = await context.db.find(schema.tokenHolder, { id: holderId })
    const oldBalance = existingHolder ? BigInt(existingHolder.balance) : 0n
    const isNewHolder = !existingHolder

    // 4. Compute new values
    const balanceChange = isBuy ? amountOut : -amountIn
    const newBalance = oldBalance + balanceChange

    let holderCount = snap.holderCount ?? 0
    const oldPositive = oldBalance > 0n
    const newPositive = newBalance > 0n
    if (!oldPositive && newPositive) holderCount += 1
    if (oldPositive && !newPositive) holderCount = Math.max(0, holderCount - 1)

    // 5. Write all updates
    if (isNewSnapshot) {
        await context.db
            .insert(schema.tokenSnapshot)
            .values({
                tokenAddr: tokenAddrLower,
                lastPrice: price > 0 ? price.toString() : '0',
                marketCapNative: marketCap,
                totalBuys: isBuy ? 1 : 0,
                totalSells: isBuy ? 0 : 1,
                totalVolumeNative: volume.toString(),
                holderCount,
                lastSwapAt: timestamp,
                updatedAt: timestamp,
            })
            .onConflictDoNothing()
    } else {
        await context.db.update(schema.tokenSnapshot, { tokenAddr: tokenAddrLower }).set({
            lastPrice: price > 0 ? price.toString() : (snap.lastPrice ?? '0'),
            marketCapNative: marketCap,
            totalBuys: (snap.totalBuys ?? 0) + (isBuy ? 1 : 0),
            totalSells: (snap.totalSells ?? 0) + (isBuy ? 0 : 1),
            totalVolumeNative: (BigInt(snap.totalVolumeNative ?? '0') + volume).toString(),
            holderCount,
            lastSwapAt: timestamp,
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
