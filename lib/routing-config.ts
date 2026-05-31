import type { Address } from 'viem'
import type { IntermediaryConfig } from '@/types/routing'
import { kubTestnet, jbc, bitkub, worldchain, base, bsc } from './wagmi'

/**
 * USDT/stablecoin address per chain for native→USD price conversion.
 * Used by the launchpad to display prices/mcaps in USD.
 */
export const NATIVE_USD_STABLE: Record<number, { address: Address; decimals: number }> = {
    [kubTestnet.id]: {
        address: '0x70138f1b88BEe73dD2Cb06F24146f964Dde6144e', // KUSDT on kubTestnet
        decimals: 18,
    },
    [bitkub.id]: {
        address: '0x7d984C24d2499D840eB3b7016077164e15E5faA6', // KUSDT on KUBChain mainnet
        decimals: 18,
    },
}

/**
 * Intermediary token addresses for multi-hop routing per chain
 */
export const INTERMEDIARY_TOKENS: Record<number, IntermediaryConfig> = {
    [kubTestnet.id]: {
        wrappedNative: '0x700D3ba307E1256e509eD3E45D6f9dff441d6907' as Address, // tKKUB
        stables: [],
        priority: ['0x700D3ba307E1256e509eD3E45D6f9dff441d6907' as Address], // tKKUB
    },
    [bitkub.id]: {
        wrappedNative: '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5' as Address, // KKUB
        stables: [
            '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as Address, // KUSDT
            '0x21cdc3706b8c7b1836df0e533dd884069521350b' as Address, // USDT
            '0x31929a0fd776F971C5dd14bF03e1F9fF69D9c91c' as Address, // USDC.e
        ],
        priority: [
            '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5' as Address, // KKUB (most liquid)
            '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as Address, // KUSDT
        ],
    },
    [jbc.id]: {
        wrappedNative: '0xC4B7C87510675167643e3DE6EEeD4D2c06A9e747' as Address, // WJBC
        stables: [
            '0x24599b658b57f91E7643f4F154B16bcd2884f9ac' as Address, // JUSDT
            '0xFD8Ef75c1cB00A594D02df48ADdc27414Bd07F8a' as Address, // USDT
        ],
        priority: [
            '0x99999999990FC47611b74827486218f3398A4abD' as Address, // jibswap's wrapped native
            '0xC4B7C87510675167643e3DE6EEeD4D2c06A9e747' as Address, // WJBC
            '0x24599b658b57f91E7643f4F154B16bcd2884f9ac' as Address, // JUSDT
            '0xFD8Ef75c1cB00A594D02df48ADdc27414Bd07F8a' as Address, // USDT
        ],
    },
    [worldchain.id]: {
        wrappedNative: '0x4200000000000000000000000000000000000006' as Address, // WETH
        stables: [
            '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as Address, // USDC
            '0xaec6f1aab292fa4e48e9cbd725b4e4b107e230bb' as Address, // USDT
        ],
        priority: [
            '0x4200000000000000000000000000000000000006' as Address, // WETH (most liquid)
            '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as Address, // USDC
        ],
    },
    [base.id]: {
        wrappedNative: '0x4200000000000000000000000000000000000006' as Address, // WETH
        stables: [
            '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as Address, // USDbC
            '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' as Address, // USDT
        ],
        priority: [
            '0x4200000000000000000000000000000000000006' as Address, // WETH (most liquid)
            '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as Address, // USDbC
        ],
    },
    [bsc.id]: {
        wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address, // WBNB
        stables: [
            '0x55d398326f99059fF775485246999027B3197955' as Address, // USDT
            '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as Address, // USDC
        ],
        priority: [
            '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address, // WBNB (most liquid)
            '0x55d398326f99059fF775485246999027B3197955' as Address, // USDT
        ],
    },
}

/**
 * Get intermediary tokens for a chain in priority order
 */
export function getIntermediaryTokens(chainId: number): Address[] {
    return INTERMEDIARY_TOKENS[chainId]?.priority ?? []
}

/**
 * Minimum improvement (in basis points) required to prefer multi-hop over direct
 * E.g., 50 = 0.5% better output required
 */
export const MIN_MULTIHOP_IMPROVEMENT_BPS = 50
