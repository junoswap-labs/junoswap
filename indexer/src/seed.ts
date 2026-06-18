import externalPools from '../external-pools.json'

// Lazy-seed lookup for pre-existing external pools. Their metadata is NOT discovered
// via a historical PairCreated/PoolCreated scan (too heavy); instead the swap handlers
// read token0/token1 (+ fee/tickSpacing for V3) from external-pools.json the first
// time a tagged swap on the pool is seen, and insert the pool row on the fly.

interface V2Entry {
    pair: string
    token0: string
    token1: string
}
interface V3Entry {
    pool: string
    token0: string
    token1: string
    fee: number
    tickSpacing: number
}

// Which chain each external V2 DEX lives on (kublerx V3 is bitkub-only).
const V2_DEX_CHAIN: Record<string, number> = {
    jibswap: 8899,
    udonswap: 96,
    ponder: 96,
    diamon: 96,
}

const v2Pools = new Map<string, { token0: string; token1: string }>()
for (const [dex, chainId] of Object.entries(V2_DEX_CHAIN)) {
    for (const e of (externalPools as unknown as Record<string, V2Entry[]>)[dex] ?? []) {
        v2Pools.set(`${chainId}-${e.pair.toLowerCase()}`, {
            token0: e.token0.toLowerCase(),
            token1: e.token1.toLowerCase(),
        })
    }
}

const v3Pools = new Map<string, V3Entry>()
for (const e of (externalPools as { kublerx?: V3Entry[] }).kublerx ?? []) {
    v3Pools.set(`96-${e.pool.toLowerCase()}`, {
        pool: e.pool.toLowerCase(),
        token0: e.token0.toLowerCase(),
        token1: e.token1.toLowerCase(),
        fee: e.fee,
        tickSpacing: e.tickSpacing,
    })
}

export function getSeedV2Pool(chainId: number, address: string) {
    return v2Pools.get(`${chainId}-${address.toLowerCase()}`)
}

export function getSeedV3Pool(chainId: number, address: string) {
    return v3Pools.get(`${chainId}-${address.toLowerCase()}`)
}
