export type DEXType = 'junoswap' | 'uniswap' | 'pancakeswap' | string

interface DEXMetadata {
    id: DEXType
    name: string
    displayName: string
    icon?: string
    description?: string
}

export const DEX_REGISTRY: Record<string, DEXMetadata> = {
    junoswap: {
        id: 'junoswap',
        name: 'junoswap',
        displayName: 'Junoswap',
        icon: 'favicon.ico',
        description: 'Uniswap v3-style CLAMM',
    },
    uniswap: {
        id: 'uniswap',
        name: 'uniswap',
        displayName: 'Uniswap V3',
        description: 'Uniswap v3-style CLAMM',
    },
    jibswap: {
        id: 'jibswap',
        name: 'jibswap',
        displayName: 'Jibswap',
        description: 'Uniswap v2-style AMM',
    },
    udonswap: {
        id: 'udonswap',
        name: 'udonswap',
        displayName: 'UdonSwap',
        description: 'Uniswap v2-style AMM',
    },
    ponder: {
        id: 'ponder',
        name: 'ponder',
        displayName: 'Ponder Finance',
        description: 'Uniswap v2-style AMM',
    },
    diamon: {
        id: 'diamon',
        name: 'diamon',
        displayName: 'Diamon Finance',
        description: 'Uniswap v2-style AMM',
    },
    pancakeswap: {
        id: 'pancakeswap',
        name: 'pancakeswap',
        displayName: 'PancakeSwap V3',
        description: 'Uniswap v3-style CLAMM',
    },
    kublerx: {
        id: 'kublerx',
        name: 'kublerx',
        displayName: 'Kublerx',
        description: 'Uniswap v3-style CLAMM',
    },
}
