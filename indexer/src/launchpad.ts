import { ponder } from 'ponder:registry'
import schema from 'ponder:schema'
import { formatEther, zeroAddress } from 'viem'
import { readERC20Metadata } from './erc20-read.js'
import {
    BONDING_CURVE_ADDRESS_BY_CHAIN,
    BONDING_CURVE_JUNOSWAP_BITKUB_ADDRESS,
} from '../abis/bonding-curve-junoswap'

// Mainnet (chain 96) handlers are only wired up once the contract is deployed and
// its address filled in; until then ponder.config omits the Bitkub contracts, so
// registering their handlers would error. Keep this flag in sync with that config.
const MAINNET_ENABLED = BONDING_CURVE_JUNOSWAP_BITKUB_ADDRESS.toLowerCase() !== zeroAddress

// Ponder's event/context types are deep generics; the other indexer handlers
// (v2-pools/v3-pools) use the same loose typing for shared helper functions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandlerArgs = { event: any; context: any }

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
function defaultSnapshot(tokenAddr: string, chainId: number) {
    return {
        tokenAddr,
        chainId,
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

async function handleCreation({ event, context }: HandlerArgs, chainId: number) {
    const { creator, tokenAddr, logo, description, link1, link2, link3, createdTime } = event.args
    const tokenAddrLower = tokenAddr.toLowerCase()

    // Use standalone viem client — Ponder's context.client forces historical block numbers
    const meta = await readERC20Metadata(chainId, tokenAddrLower)

    await context.db
        .insert(schema.launchToken)
        .values({
            tokenAddr: tokenAddrLower,
            chainId,
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
}

async function handleSwap({ event, context }: HandlerArgs, chainId: number) {
    const { sender, isBuy, tokenAddr, amountIn, amountOut, reserveIn, reserveOut } = event.args
    const tokenAddrLower = tokenAddr.toLowerCase()
    const senderLower = sender.toLowerCase()
    // Prefix ids with chainId — block numbers/log indices are per-chain and would
    // otherwise collide across testnet and mainnet in the shared tables.
    const id = `${chainId}-${event.block.number}-${event.log.logIndex}`
    const timestamp = Number(event.block.timestamp)

    // 1. Insert swap event
    await context.db.insert(schema.swapEvent).values({
        id,
        chainId,
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
    const nativePriceRecord = await context.db.find(schema.nativeUsdPrice, { chainId })
    const nativeUsd = nativePriceRecord ? parseFloat(nativePriceRecord.price) : 0
    const priceUsd = nativeUsd > 0 && price > 0 ? price * nativeUsd : 0

    // 3. Read current snapshot (from previous events), or use defaults
    const existingSnapshot = await context.db.find(schema.tokenSnapshot, {
        tokenAddr: tokenAddrLower,
    })
    const snap = existingSnapshot ?? defaultSnapshot(tokenAddrLower, chainId)
    const isNewSnapshot = !existingSnapshot

    const athMarketCap = Math.max(
        parseFloat(marketCap),
        parseFloat(snap.athMarketCapNative ?? '0')
    ).toString()

    // 4. Read current holder state
    const holderId = `${chainId}-${tokenAddrLower}-${senderLower}`
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
                chainId,
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
                chainId,
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
}

async function handleGraduation({ event, context }: HandlerArgs) {
    const { tokenAddr } = event.args

    // tokenAddr is the primary key (globally unique across chains), so no chainId
    // is needed to locate the row.
    await context.db.update(schema.launchToken, { tokenAddr: tokenAddr.toLowerCase() }).set({
        isGraduated: 1,
        graduatedAt: Number(event.block.timestamp),
    })
}

// Launch-token ERC20 transfers. Feeds the Portfolio activity feed's transfer rows
// AND maintains tokenHolder balances for genuine token movements — P2P transfers and
// post-graduation V3-pool trades (the pool emits LaunchToken transfers pool↔trader).
// We exclude mints/burns (the zero address) and bonding-curve swap legs (counterparty
// is BondingCurveJunoswap): those are already captured as swapEvent and their tokenHolder
// balances are maintained by handleSwap, so recording them here would double-count.
async function handleTransfer({ event, context }: HandlerArgs, chainId: number) {
    const { from, to, amount } = event.args
    const fromLower = from.toLowerCase()
    const toLower = to.toLowerCase()
    const tokenAddrLower = event.log.address.toLowerCase()
    const bondingCurveLower = BONDING_CURVE_ADDRESS_BY_CHAIN[chainId]

    if (fromLower === zeroAddress || toLower === zeroAddress) return
    if (fromLower === bondingCurveLower || toLower === bondingCurveLower) return

    await context.db
        .insert(schema.transferEvent)
        .values({
            id: `${chainId}-${event.block.number}-${event.log.logIndex}`,
            chainId,
            tokenAddr: tokenAddrLower,
            from: fromLower,
            to: toLower,
            amount: amount.toString(),
            blockNumber: Number(event.block.number),
            timestamp: Number(event.block.timestamp),
            transactionHash: event.transaction.hash,
        })
        .onConflictDoNothing()

    // Apply the balance delta to each side and adjust holderCount on a zero crossing,
    // mirroring handleSwap. The snapshot is guaranteed to exist here: a non-curve transfer
    // can only happen after a buy (which creates it), so we never need to create one.
    const amt = BigInt(amount)
    const fromNew = await applyHolderDelta(context, chainId, tokenAddrLower, fromLower, -amt)
    const toNew = await applyHolderDelta(context, chainId, tokenAddrLower, toLower, amt)

    const snap = await context.db.find(schema.tokenSnapshot, { tokenAddr: tokenAddrLower })
    if (snap) {
        let holderCount = snap.holderCount ?? 0
        if (fromNew.crossedToZero) holderCount = Math.max(0, holderCount - 1)
        if (toNew.crossedToPositive) holderCount += 1
        if (holderCount !== (snap.holderCount ?? 0)) {
            await context.db
                .update(schema.tokenSnapshot, { tokenAddr: tokenAddrLower })
                .set({ holderCount })
        }
    }
}

// Upserts a tokenHolder balance by `delta` and reports whether the balance crossed zero,
// so the caller can keep holderCount in step.
async function applyHolderDelta(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    chainId: number,
    tokenAddr: string,
    address: string,
    delta: bigint
): Promise<{ crossedToPositive: boolean; crossedToZero: boolean }> {
    const id = `${chainId}-${tokenAddr}-${address}`
    const existing = await context.db.find(schema.tokenHolder, { id })
    const oldBalance = existing ? BigInt(existing.balance) : 0n
    const newBalance = oldBalance + delta

    if (existing) {
        await context.db.update(schema.tokenHolder, { id }).set({ balance: newBalance.toString() })
    } else {
        await context.db
            .insert(schema.tokenHolder)
            .values({ id, chainId, tokenAddr, address, balance: newBalance.toString() })
            .onConflictDoNothing()
    }

    return {
        crossedToPositive: oldBalance <= 0n && newBalance > 0n,
        crossedToZero: oldBalance > 0n && newBalance <= 0n,
    }
}

// kub testnet (chain 25925)
ponder.on('BondingCurveJunoswap:Creation', (args) => handleCreation(args, 25925))
ponder.on('BondingCurveJunoswap:Swap', (args) => handleSwap(args, 25925))
ponder.on('BondingCurveJunoswap:Graduation', (args) => handleGraduation(args))
ponder.on('LaunchToken:Transfer', (args) => handleTransfer(args, 25925))

// kub mainnet (chain 96) — only registered once the contract is deployed (see
// MAINNET_ENABLED). The Bitkub contracts must be present in ponder.config for these
// registrations to resolve.
if (MAINNET_ENABLED) {
    // The Bitkub contracts are conditionally present in ponder.config (gated on the
    // same flag), so they aren't in the static config type — cast the event names to
    // their testnet counterparts to satisfy ponder.on's EventNames union. At runtime
    // the real string resolves against the registered Bitkub contracts.
    ponder.on('BondingCurveJunoswapBitkub:Creation' as 'BondingCurveJunoswap:Creation', (args) =>
        handleCreation(args, 96)
    )
    ponder.on('BondingCurveJunoswapBitkub:Swap' as 'BondingCurveJunoswap:Swap', (args) =>
        handleSwap(args, 96)
    )
    ponder.on(
        'BondingCurveJunoswapBitkub:Graduation' as 'BondingCurveJunoswap:Graduation',
        (args) => handleGraduation(args)
    )
    ponder.on('LaunchTokenBitkub:Transfer' as 'LaunchToken:Transfer', (args) =>
        handleTransfer(args, 96)
    )
}
