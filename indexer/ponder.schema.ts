import { onchainTable } from 'ponder'

export const launchToken = onchainTable('launch_token', (t) => ({
    tokenAddr: t.text().primaryKey(),
    creator: t.text().notNull(),
    name: t.text().default(''),
    symbol: t.text().default(''),
    logo: t.text().default(''),
    description: t.text().default(''),
    link1: t.text().default(''),
    link2: t.text().default(''),
    link3: t.text().default(''),
    createdTime: t.integer().notNull(),
    isGraduated: t.integer().default(0),
    graduatedAt: t.integer(),
    createdAtBlock: t.integer().notNull(),
}))

export const swapEvent = onchainTable('swap_event', (t) => ({
    id: t.text().primaryKey(),
    tokenAddr: t.text().notNull(),
    sender: t.text().notNull(),
    isBuy: t.integer().notNull(),
    amountIn: t.text().notNull(),
    amountOut: t.text().notNull(),
    reserveIn: t.text().notNull(),
    reserveOut: t.text().notNull(),
    blockNumber: t.integer().notNull(),
    timestamp: t.integer().notNull(),
    transactionHash: t.text().notNull(),
}))

export const tokenSnapshot = onchainTable('token_snapshot', (t) => ({
    tokenAddr: t.text().primaryKey(),
    lastPrice: t.text().default('0'),
    lastPriceUsd: t.text().default('0'),
    marketCapNative: t.text().default('0'),
    athMarketCapNative: t.text().default('0'),
    totalBuys: t.integer().default(0),
    totalSells: t.integer().default(0),
    totalVolumeNative: t.text().default('0'),
    holderCount: t.integer().default(0),
    lastSwapAt: t.integer(),
    updatedAt: t.integer().notNull(),
}))

export const tokenHolder = onchainTable('token_holder', (t) => ({
    id: t.text().primaryKey(),
    tokenAddr: t.text().notNull(),
    address: t.text().notNull(),
    balance: t.text().notNull(),
}))

export const v3SwapEvent = onchainTable('v3_swap_event', (t) => ({
    id: t.text().primaryKey(),
    poolAddress: t.text().notNull(),
    tokenAddr: t.text().notNull(),
    sender: t.text().notNull(),
    recipient: t.text().notNull(),
    txFrom: t.text().notNull(),
    amount0: t.text().notNull(),
    amount1: t.text().notNull(),
    sqrtPriceX96: t.text().notNull(),
    liquidity: t.text().notNull(),
    tick: t.integer().notNull(),
    blockNumber: t.integer().notNull(),
    timestamp: t.integer().notNull(),
    transactionHash: t.text().notNull(),
}))

export const v3Token = onchainTable('v3_token', (t) => ({
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    address: t.text().notNull(),
    symbol: t.text().default(''),
    name: t.text().default(''),
    decimals: t.integer().default(18),
    createdAt: t.integer().notNull(),
}))

export const v3Pool = onchainTable('v3_pool', (t) => ({
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    address: t.text().notNull(),
    token0: t.text().notNull(),
    token1: t.text().notNull(),
    fee: t.integer().notNull(),
    tickSpacing: t.integer().notNull(),
    createdAtBlock: t.integer().notNull(),
    createdAtTimestamp: t.integer().notNull(),
}))

export const v3PoolDayVolume = onchainTable('v3_pool_day_volume', (t) => ({
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    poolAddress: t.text().notNull(),
    dayTimestamp: t.integer().notNull(),
    volumeToken0: t.text().notNull(),
    volumeToken1: t.text().notNull(),
    swapCount: t.integer().notNull(),
    updatedAt: t.integer().notNull(),
}))

export const nativeUsdPrice = onchainTable('native_usd_price', (t) => ({
    chainId: t.integer().primaryKey(),
    price: t.text().notNull(),
    poolAddress: t.text().notNull(),
    updatedAt: t.integer().notNull(),
}))

export const v3TokenSnapshot = onchainTable('v3_token_snapshot', (t) => ({
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    tokenAddr: t.text().notNull(),
    lastPriceNative: t.text().default('0'),
    lastPriceUsd: t.text().default('0'),
    lastSwapAt: t.integer(),
    updatedAt: t.integer().notNull(),
}))
