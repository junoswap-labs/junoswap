import type { Address } from 'viem'
import { http, createConfig } from 'wagmi'
import { cookieStorage, createStorage } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { bsc, bitkub, jbc, base, worldchain } from 'wagmi/chains'

export { bsc, bitkub, jbc, base, worldchain }

export const kubTestnet = {
    id: 25925,
    name: 'KUB Testnet',
    nativeCurrency: { name: 'tKUB', symbol: 'tKUB', decimals: 18 },
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
    connectors: [
        injected(),
        walletConnect({
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
            showQrModal: true,
        }),
    ],
    transports: {
        [bsc.id]: http(rpcUrls[bsc.id], { batch: true }),
        [bitkub.id]: http(rpcUrls[bitkub.id], { batch: true }),
        [kubTestnet.id]: http(rpcUrls[kubTestnet.id], { batch: true }),
        [jbc.id]: http(rpcUrls[jbc.id], { batch: true }),
        [base.id]: http(rpcUrls[base.id], { batch: true }),
        [worldchain.id]: http(rpcUrls[worldchain.id], { batch: true }),
    },
    ssr: true,
    storage: createStorage({
        storage: cookieStorage,
    }),
})

/** Test chains get minute-scale schedules, so a farm or epoch can be watched end to end. */
export function isTestnetChain(chainId: number): boolean {
    return supportedChains.some(
        (chain) => chain.id === chainId && 'testnet' in chain && chain.testnet
    )
}

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
        symbol: 'tKUB',
        icon: '/chains/kubtestnet.svg',
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

export const NATIVE_TOKEN_ADDRESS: Address = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

export function isNativeToken(address: Address): boolean {
    return address.toLowerCase() === NATIVE_TOKEN_ADDRESS
}

const SKIP_UNWRAP_CHAINS: readonly number[] = [bitkub.id]

export function shouldSkipUnwrap(chainId: number): boolean {
    return SKIP_UNWRAP_CHAINS.includes(chainId)
}
