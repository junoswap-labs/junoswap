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

// P2P (and swap-related) ERC20 transfers of launch tokens. Mints/burns and
// bonding-curve swaps are filtered in the handler, so this captures genuine
// token movements — what the Portfolio activity feed shows as transfers.
export const transferEvent = onchainTable('transfer_event', (t) => ({
    id: t.text().primaryKey(),
    tokenAddr: t.text().notNull(),
    from: t.text().notNull(),
    to: t.text().notNull(),
    amount: t.text().notNull(),
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
    price1dAgo: t.text(),
    price1dAgoTimestamp: t.integer(),
    priceChange1dPct: t.text(),
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
    chainId: t.integer().notNull(),
    poolAddress: t.text().notNull(),
    tokenAddr: t.text().notNull(),
    // Whether tokenAddr is token0 of the pool. The paired token is always wrapped
    // native, so this disambiguates which of amount0/amount1 is the token vs native —
    // the launch token can sort to either side of WKUB.
    tokenIsToken0: t.integer().notNull().default(1),
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
    // 1 when the swap's calldata carried the juno tracking marker — i.e. it was
    // routed through this frontend. Junoswap's own pool swaps are untagged (0).
    viaFrontend: t.integer().notNull().default(0),
    // Optional ?ref= attribution address from the tracking suffix. Null when no
    // referral link was used (independent of viaFrontend).
    referrer: t.text(),
    // Both pool legs, for the generalized (token/token) activity display. Populated
    // for external (kublerx) rows; Junoswap rows may leave these null and use the
    // native-paired tokenAddr/tokenIsToken0 decode.
    token0Addr: t.text(),
    token1Addr: t.text(),
    // Liquidity source the swap executed on (matches lib/dex-config dexIds):
    // 'junoswap' for our own V3 pools, 'kublerx' for the external V3 DEX.
    protocol: t.text().notNull().default(''),
}))

// Swaps on external (non-Junoswap) Uniswap-V2-style pairs, indexed from the
// tracking start block onward. Shape mirrors v3SwapEvent; amounts follow the V2
// Swap event (separate in/out per token side).
export const v2SwapEvent = onchainTable('v2_swap_event', (t) => ({
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    poolAddress: t.text().notNull(),
    tokenAddr: t.text().notNull(),
    tokenIsToken0: t.integer().notNull().default(1),
    sender: t.text().notNull(),
    to: t.text().notNull(),
    txFrom: t.text().notNull(),
    amount0In: t.text().notNull(),
    amount1In: t.text().notNull(),
    amount0Out: t.text().notNull(),
    amount1Out: t.text().notNull(),
    blockNumber: t.integer().notNull(),
    timestamp: t.integer().notNull(),
    transactionHash: t.text().notNull(),
    // Always 1 — external V2 pools only record swaps that carry the juno marker.
    viaFrontend: t.integer().notNull().default(0),
    referrer: t.text(),
    // Both pool legs (denormalized) so the activity feed renders both sides without
    // a join — supports token/token pools that have no native leg.
    token0Addr: t.text().notNull(),
    token1Addr: t.text().notNull(),
    // External V2 DEX the swap executed on (matches lib/dex-config dexIds):
    // 'jibswap' | 'udonswap' | 'ponder' | 'diamon'.
    protocol: t.text().notNull().default(''),
}))

export const v2Pool = onchainTable('v2_pool', (t) => ({
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    address: t.text().notNull(),
    token0: t.text().notNull(),
    token1: t.text().notNull(),
    createdAtBlock: t.integer().notNull(),
    createdAtTimestamp: t.integer().notNull(),
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

// Append-only history of the native (KUB) USD price, one row per native/stablecoin
// pool swap. Lets the portfolio value each trade at the KUB/USD rate at its timestamp
// instead of repricing all history at the current rate. Reconstructed on reindex.
export const nativeUsdPriceSnapshot = onchainTable('native_usd_price_snapshot', (t) => ({
    id: t.text().primaryKey(), // `${chainId}-${blockNumber}-${logIndex}`
    chainId: t.integer().notNull(),
    price: t.text().notNull(),
    timestamp: t.integer().notNull(),
    blockNumber: t.integer().notNull(),
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
