import type { Address } from 'viem'

/**
 * Token information
 */
export interface Token {
    address: Address
    symbol: string
    name: string
    decimals: number
    chainId: number
    logo?: string
}
