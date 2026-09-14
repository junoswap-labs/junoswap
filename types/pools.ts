export interface V3PoolRow {
    address: string
    token0: string
    token1: string
    fee: number
    tickSpacing: number
}

export interface V3TokenRow {
    id: string
    chainId: number
    address: string
    symbol: string | null
    name: string | null
    decimals: number | null
}

export interface PoolMetricsToken {
    address: string
    symbol: string
    name: string
    decimals: number
}

export interface PoolMetrics {
    address: string
    fee: number
    tickSpacing: number
    token0: PoolMetricsToken
    token1: PoolMetricsToken
    sqrtPriceX96: bigint
    tick: number | null
    liquidity: bigint
    price: number
    tvlUsd: number | null
    volume1dUsd: number | null
    volume30dUsd: number | null
    feeAprPercent: number | null
}
