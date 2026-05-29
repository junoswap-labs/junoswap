import type { Address } from 'viem'
import type { DEXType } from '@/types/dex'
import { kubTestnet, jbc, bitkub, worldchain, base, bsc } from './wagmi'

/**
 * Protocol types supported by the DEX system
 */
export enum ProtocolType {
    V2 = 'v2',
    V3 = 'v3',
}

/**
 * Base configuration interface for all protocol types
 */
interface BaseProtocolConfig {
    protocolType: ProtocolType
    chainId: number
    enabled: boolean
}

/**
 * Uniswap V2 protocol configuration
 * Used for constant product AMM DEXs
 */
interface V2Config extends BaseProtocolConfig {
    protocolType: ProtocolType.V2
    factory: Address
    router: Address
    wnative?: Address
}

/**
 * Uniswap V3 protocol configuration
 * Used for concentrated liquidity AMM DEXs
 */
interface V3Config extends BaseProtocolConfig {
    protocolType: ProtocolType.V3
    factory: Address
    quoter: Address
    swapRouter: Address
    positionManager?: Address
    staker?: Address // V3 Staker contract for LP mining
    feeTiers?: number[]
    defaultFeeTier?: number
    routerVersion?: 'v1' | 'v2' // v1 = original SwapRouter (has deadline param), v2 = SwapRouter02 (no deadline)
}

/**
 * Union type of all protocol configurations
 */
type ProtocolConfig = V2Config | V3Config

/**
 * DEX configuration containing all protocols supported by a DEX
 */
interface DEXConfiguration {
    dexId: DEXType
    defaultProtocol: ProtocolType
    priority?: number
    protocols: Record<number, Partial<Record<ProtocolType, ProtocolConfig>>>
}

/**
 * Fee tiers for Uniswap V3 pools
 */
export const FEE_TIERS = {
    STABLE: 100, // 0.01%
    LOW: 500, // 0.05%
    MEDIUM: 3000, // 0.3% (standard)
    HIGH: 10000, // 1%
} as const

/**
 * Fee tiers for PancakeSwap V3 pools
 * NOTE: PancakeSwap uses 0.25% (2500) instead of Uniswap's 0.3% (3000)
 */
const PANCAKESWAP_FEE_TIERS = {
    STABLE: 100, // 0.01%
    LOW: 500, // 0.05%
    MEDIUM: 2500, // 0.25% (PancakeSwap standard - different from Uniswap!)
    HIGH: 10000, // 1%
} as const

/**
 * Unified DEX configuration registry
 */
const DEX_CONFIGS_REGISTRY: Record<DEXType, DEXConfiguration> = {
    junoswap: {
        dexId: 'junoswap',
        defaultProtocol: ProtocolType.V3,
        priority: 1,
        protocols: {
            [kubTestnet.id]: {
                [ProtocolType.V3]: {
                    protocolType: ProtocolType.V3,
                    chainId: kubTestnet.id,
                    enabled: true,
                    factory: '0xCBd41F872FD46964bD4Be4d72a8bEBA9D656565b' as Address,
                    quoter: '0x3F64C4Dfd224a102A4d705193a7c40899Cf21fFe' as Address,
                    swapRouter: '0x3C5514335dc4E2B0D9e1cc98ddE219c50173c5Be' as Address,
                    positionManager: '0x690f45C21744eCC4ac0D897ACAC920889c3cFa4b' as Address,
                    staker: '0xe445e132E9D4d0863E0BE079faf716A97250f37E' as Address,
                    feeTiers: [FEE_TIERS.STABLE, FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH],
                    defaultFeeTier: FEE_TIERS.MEDIUM,
                },
            },
            [jbc.id]: {
                [ProtocolType.V3]: {
                    protocolType: ProtocolType.V3,
                    chainId: jbc.id,
                    enabled: true,
                    factory: '0x5835f123bDF137864263bf204Cf4450aAD1Ba3a7' as Address,
                    quoter: '0x5ad32c64A2aEd381299061F32465A22B1f7A2EE2' as Address,
                    swapRouter: '0x2174b3346CCEdBB4Faaff5d8088ff60B74909A9d' as Address,
                    positionManager: '0xfC445018B20522F9cEd1350201e179555a7573A1' as Address,
                    staker: '0xC7Aa8C815937B61F70E04d814914683bB9Bd7579' as Address,
                    feeTiers: [FEE_TIERS.STABLE, FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH],
                    defaultFeeTier: FEE_TIERS.MEDIUM,
                },
            },
            [bitkub.id]: {
                [ProtocolType.V3]: {
                    protocolType: ProtocolType.V3,
                    chainId: bitkub.id,
                    enabled: true,
                    factory: '0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C' as Address,
                    quoter: '0xCB0c6E78519f6B4c1b9623e602E831dEf0f5ff7f' as Address,
                    swapRouter: '0x3F7582E36843FF79F173c7DC19f517832496f2D8' as Address,
                    positionManager: '0xb6b76870549893c6b59E7e979F254d0F9Cca4Cc9' as Address,
                    staker: '0xC216ad61623617Aa01b757A06836AA8D6fb547fF' as Address,
                    feeTiers: [FEE_TIERS.STABLE, FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH],
                    defaultFeeTier: FEE_TIERS.MEDIUM,
                },
            },
        },
    },
    uniswap: {
        dexId: 'uniswap',
        defaultProtocol: ProtocolType.V3,
        priority: 1,
        protocols: {
            [worldchain.id]: {
                [ProtocolType.V3]: {
                    protocolType: ProtocolType.V3,
                    chainId: worldchain.id,
                    enabled: true,
                    factory: '0x7a5028BDa40e7B173C278C5342087826455ea25a' as Address,
                    quoter: '0x10158D43e6cc414deE1Bd1eB0EfC6a5cBCfF244c' as Address,
                    swapRouter: '0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6' as Address,
                    feeTiers: [FEE_TIERS.STABLE, FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH],
                    defaultFeeTier: FEE_TIERS.MEDIUM,
                },
            },
            [base.id]: {
                [ProtocolType.V3]: {
                    protocolType: ProtocolType.V3,
                    chainId: base.id,
                    enabled: true,
                    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD' as Address,
                    quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as Address,
                    swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481' as Address,
                    feeTiers: [FEE_TIERS.STABLE, FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH],
                    defaultFeeTier: FEE_TIERS.MEDIUM,
                },
            },
        },
    },
    jibswap: {
        dexId: 'jibswap',
        defaultProtocol: ProtocolType.V2,
        priority: 2,
        protocols: {
            [jbc.id]: {
                [ProtocolType.V2]: {
                    protocolType: ProtocolType.V2,
                    chainId: jbc.id,
                    enabled: true,
                    factory: '0x4BBdA880C5A0cDcEc6510f0450c6C8bC5773D499' as Address,
                    router: '0x766F8C9321704DC228D43271AF9b7aAB0E529D38' as Address,
                    wnative: '0x99999999990FC47611b74827486218f3398A4abD' as Address,
                },
            },
        },
    },
    udonswap: {
        dexId: 'udonswap',
        defaultProtocol: ProtocolType.V2,
        priority: 3,
        protocols: {
            [bitkub.id]: {
                [ProtocolType.V2]: {
                    protocolType: ProtocolType.V2,
                    chainId: bitkub.id,
                    enabled: true,
                    factory: '0x18c7a4CA020A0c648976208dF2e3AE1BAA32e8d1' as Address,
                    router: '0x7aA32A818cD3a6BcdF827f6a411B7adFF56e7A4A' as Address,
                },
            },
        },
    },
    ponder: {
        dexId: 'ponder',
        defaultProtocol: ProtocolType.V2,
        priority: 4,
        protocols: {
            [bitkub.id]: {
                [ProtocolType.V2]: {
                    protocolType: ProtocolType.V2,
                    chainId: bitkub.id,
                    enabled: true,
                    factory: '0x20B17e92Dd1866eC647ACaA38fe1f7075e4B359E' as Address,
                    router: '0xD19C5cebFa9A8919Cc3db2F19163089feBd9604E' as Address,
                },
            },
        },
    },
    diamon: {
        dexId: 'diamon',
        defaultProtocol: ProtocolType.V2,
        priority: 5,
        protocols: {
            [bitkub.id]: {
                [ProtocolType.V2]: {
                    protocolType: ProtocolType.V2,
                    chainId: bitkub.id,
                    enabled: true,
                    factory: '0x6E906Dc4749642a456907deCB323A0065dC6F26E' as Address,
                    router: '0xAb30a29168D792c5e6a54E4bcF1Aec926a3b20FA' as Address,
                },
            },
        },
    },
    pancakeswap: {
        dexId: 'pancakeswap',
        defaultProtocol: ProtocolType.V3,
        priority: 1,
        protocols: {
            [bsc.id]: {
                [ProtocolType.V3]: {
                    protocolType: ProtocolType.V3,
                    chainId: bsc.id,
                    enabled: true,
                    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as Address,
                    quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997' as Address,
                    swapRouter: '0x1b81D678ffb9C0263b24A97847620C99d213eB14' as Address,
                    feeTiers: [
                        PANCAKESWAP_FEE_TIERS.STABLE,
                        PANCAKESWAP_FEE_TIERS.LOW,
                        PANCAKESWAP_FEE_TIERS.MEDIUM,
                        PANCAKESWAP_FEE_TIERS.HIGH,
                    ],
                    defaultFeeTier: PANCAKESWAP_FEE_TIERS.MEDIUM,
                },
            },
        },
    },
    kublerx: {
        dexId: 'kublerx',
        defaultProtocol: ProtocolType.V3,
        priority: 2,
        protocols: {
            [bitkub.id]: {
                [ProtocolType.V3]: {
                    protocolType: ProtocolType.V3,
                    chainId: bitkub.id,
                    enabled: true,
                    factory: '0xD679d310008A2595B8d3DeB83bb93EB23F9b0942' as Address,
                    quoter: '0x63661462C66f13eD121f394Dc57726c1c33672de' as Address,
                    swapRouter: '0x6A37687F06780ee8B1b8634b7f7c053cCc58672a' as Address,
                    positionManager: '0xA8fa5d2774f850Fba2bC572e38b1dB340233e837' as Address,
                    feeTiers: [FEE_TIERS.STABLE, FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH],
                    defaultFeeTier: FEE_TIERS.LOW,
                    routerVersion: 'v1',
                },
            },
        },
    },
}

/**
 * Get V3 protocol configuration with type narrowing
 */
export function getV3Config(chainId: number, dexId?: DEXType): V3Config | undefined {
    const targetDex = dexId || 'junoswap'
    const dexConfig = DEX_CONFIGS_REGISTRY[targetDex]

    if (!dexConfig) {
        return undefined
    }

    const chainProtocols = dexConfig.protocols[chainId]
    if (!chainProtocols) {
        return undefined
    }

    const config = chainProtocols[ProtocolType.V3]
    return config?.protocolType === ProtocolType.V3 && config.enabled ? config : undefined
}

/**
 * Get V3 Staker contract address for LP mining
 */
export function getV3StakerAddress(chainId: number, dexId?: DEXType): Address | undefined {
    const config = getV3Config(chainId, dexId)
    return config?.staker
}

/**
 * Get V2 protocol configuration with type narrowing
 */
export function getV2Config(chainId: number, dexId?: DEXType): V2Config | undefined {
    const targetDex = dexId || 'junoswap'
    const dexConfig = DEX_CONFIGS_REGISTRY[targetDex]

    if (!dexConfig) {
        return undefined
    }

    const chainProtocols = dexConfig.protocols[chainId]
    if (!chainProtocols) {
        return undefined
    }

    const config = chainProtocols[ProtocolType.V2]
    return config?.protocolType === ProtocolType.V2 && config.enabled ? config : undefined
}

/**
 * Get default protocol configuration for a DEX on a chain
 */
export function getDexConfig(chainId: number, dexId?: DEXType): ProtocolConfig | undefined {
    const targetDex = dexId || 'junoswap'
    const dexConfig = DEX_CONFIGS_REGISTRY[targetDex]

    if (!dexConfig) {
        return undefined
    }

    const chainProtocols = dexConfig.protocols[chainId]
    if (!chainProtocols) {
        return undefined
    }

    return chainProtocols[dexConfig.defaultProtocol]
}

/**
 * Get all DEXs that support a specific protocol on a chain
 */
export function getDexsByProtocol(chainId: number, protocolType: ProtocolType): DEXType[] {
    return Object.entries(DEX_CONFIGS_REGISTRY)
        .filter(([_, dexConfig]) => {
            const chainProtocols = dexConfig.protocols[chainId]
            if (!chainProtocols) return false

            const protocol = chainProtocols[protocolType]
            return protocol?.enabled ?? false
        })
        .map(([dexId, _]) => dexId as DEXType)
        .sort((a, b) => {
            const priorityA = DEX_CONFIGS_REGISTRY[a]?.priority ?? 999
            const priorityB = DEX_CONFIGS_REGISTRY[b]?.priority ?? 999
            return priorityA - priorityB
        })
}

/**
 * Get all supported DEXs for a chain (any protocol)
 */
export function getSupportedDexs(chainId: number): DEXType[] {
    return Object.entries(DEX_CONFIGS_REGISTRY)
        .filter(([_, dexConfig]) => {
            const chainProtocols = dexConfig.protocols[chainId]
            if (!chainProtocols) return false

            return Object.values(chainProtocols).some((protocol) => protocol.enabled)
        })
        .map(([dexId, _]) => dexId as DEXType)
        .sort((a, b) => {
            const priorityA = DEX_CONFIGS_REGISTRY[a]?.priority ?? 999
            const priorityB = DEX_CONFIGS_REGISTRY[b]?.priority ?? 999
            return priorityA - priorityB
        })
}

/**
 * Type guard to check if config is V2Config
 */
export function isV2Config(config: ProtocolConfig): config is V2Config {
    return config.protocolType === ProtocolType.V2
}

/**
 * Type guard to check if config is V3Config
 */
export function isV3Config(config: ProtocolConfig): config is V3Config {
    return config.protocolType === ProtocolType.V3
}

/**
 * Get the spender address for token approval based on protocol type
 * Different protocols use different contract addresses for approvals:
 * - V2: router
 * - V3: swapRouter
 * - Aggregator: aggregator
 * - Stable: registry (typically)
 *
 * @param config Protocol configuration
 * @returns Spender address or undefined if config is invalid
 */
export function getProtocolSpender(config: ProtocolConfig): Address | undefined {
    switch (config.protocolType) {
        case ProtocolType.V2:
            return config.router
        case ProtocolType.V3:
            return config.swapRouter
        default:
            return undefined
    }
}

/**
 * Check if a DEX uses SwapRouter v1 (original, has deadline param)
 * Default is v2 (SwapRouter02, no deadline) if not specified
 */
export function isRouterV1(chainId: number, dexId?: DEXType): boolean {
    const config = getV3Config(chainId, dexId)
    return config?.routerVersion === 'v1'
}

/**
 * Default fee tier to use (0.3% is most common)
 */
export const DEFAULT_FEE_TIER = FEE_TIERS.MEDIUM

/**
 * Get the default DEX for a given chain
 * Returns 'pancakeswap' for BSC (uses PancakeSwap V3)
 * Returns 'uniswap' for Worldchain and Base (uses actual Uniswap V3)
 * Returns 'junoswap' for other chains (uses forked/custom deployments)
 */
export function getDefaultDexForChain(chainId: number): DEXType {
    if (chainId === bsc.id) return 'pancakeswap'
    if (chainId === worldchain.id || chainId === base.id) return 'uniswap'
    return 'junoswap'
}
