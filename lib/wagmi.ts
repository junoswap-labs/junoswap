import { http, createConfig } from 'wagmi'
import { cookieStorage, createStorage } from 'wagmi'
import { bsc, bitkub, jbc, base, worldchain } from 'wagmi/chains'
import type { Address } from 'viem'

export { bsc, bitkub, jbc, base, worldchain }

export const kubTestnet = {
    id: 25925,
    name: 'KUB Testnet',
    nativeCurrency: { name: 'KUB', symbol: 'KUB', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://rpc-testnet.bitkubchain.io'] },
    },
    blockExplorers: {
        default: { name: 'KUB Testnet Explorer', url: 'https://testnet.bkcscan.com' },
    },
    testnet: true,
} as const

export const supportedChains = [bitkub, bsc, kubTestnet, jbc, base, worldchain] as const

const rpcUrls = {
    [bsc.id]: 'https://56.rpc.thirdweb.com',
    [bitkub.id]: 'https://rpc.bitkubchain.io',
    [kubTestnet.id]: 'https://rpc-testnet.bitkubchain.io',
    [jbc.id]: 'https://rpc-l1.jibchain.net',
    [base.id]: 'https://mainnet.base.org',
    [worldchain.id]: 'https://worldchain-mainnet.g.alchemy.com/public',
}

export const wagmiConfig = createConfig({
    chains: supportedChains,
    transports: {
        [bsc.id]: http(rpcUrls[bsc.id]),
        [bitkub.id]: http(rpcUrls[bitkub.id]),
        [kubTestnet.id]: http(rpcUrls[kubTestnet.id]),
        [jbc.id]: http(rpcUrls[jbc.id]),
        [base.id]: http(rpcUrls[base.id]),
        [worldchain.id]: http(rpcUrls[worldchain.id]),
    },
    ssr: true,
    storage: createStorage({
        storage: cookieStorage,
    }),
})

export const chainMetadata = {
    [bsc.id]: {
        name: 'BNB Chain',
        symbol: 'BNB',
        icon: '/chains/bnbchain.svg',
        explorer: 'https://bscscan.com',
    },
    [bitkub.id]: {
        name: 'KUB Chain',
        symbol: 'KUB',
        icon: '/chains/kubchain.png',
        explorer: 'https://www.bkcscan.com',
    },
    [kubTestnet.id]: {
        name: 'KUB Testnet',
        symbol: 'KUB',
        icon: '/chains/kubchain.png',
        explorer: 'https://testnet.bkcscan.com',
    },
    [jbc.id]: {
        name: 'JB Chain',
        symbol: 'JBC',
        icon: '/chains/jbchain.png',
        explorer: 'https://exp-l1.jibchain.net',
    },
    [base.id]: {
        name: 'Base',
        symbol: 'ETH',
        icon: '/chains/base.svg',
        explorer: 'https://basescan.org',
    },
    [worldchain.id]: {
        name: 'Worldchain',
        symbol: 'ETH',
        icon: '/chains/worldchain.svg',
        invertInLight: true as const,
        explorer: 'https://worldchain-mainnet.g.alchemy.com',
    },
} as const

export function getChainMetadata(chainId: number) {
    return chainMetadata[chainId as keyof typeof chainMetadata]
}

/** Native tokens (ETH, KUB, …) are represented by the sentinel address 0xeee…eee. */
export function isNativeToken(address: Address): boolean {
    return address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
}

/**
 * Chains that must NOT unwrap wrapped native (KYC/regulatory) — they collect the
 * wrapped token (e.g. KKUB) instead of the native token.
 */
const SKIP_UNWRAP_CHAINS = [bitkub.id] as const

export function shouldSkipUnwrap(chainId: number): boolean {
    return SKIP_UNWRAP_CHAINS.includes(chainId as (typeof SKIP_UNWRAP_CHAINS)[number])
}
