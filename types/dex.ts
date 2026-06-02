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
        displayName: 'JunoSwap',
        icon: 'favicon.ico',
        description: 'Uniswap V3 DEX',
    },
    uniswap: {
        id: 'uniswap',
        name: 'uniswap',
        displayName: 'Uniswap V3',
        description: 'Uniswap V3 DEX',
    },
    jibswap: {
        id: 'jibswap',
        name: 'jibswap',
        displayName: 'Jibswap',
        description: 'Uniswap V2 DEX',
    },
    commudao: {
        id: 'commudao',
        name: 'commudao',
        displayName: 'Commudao',
        description: 'Custom AMM',
    },
    udonswap: {
        id: 'udonswap',
        name: 'udonswap',
        displayName: 'UdonSwap',
        description: 'Uniswap V2 DEX',
    },
    ponder: {
        id: 'ponder',
        name: 'ponder',
        displayName: 'Ponder Finance',
        description: 'Uniswap V2 DEX',
    },
    diamon: {
        id: 'diamon',
        name: 'diamon',
        displayName: 'Diamon Finance',
        description: 'Uniswap V2 DEX',
    },
    pancakeswap: {
        id: 'pancakeswap',
        name: 'pancakeswap',
        displayName: 'PancakeSwap V3',
        description: 'Uniswap V3 DEX',
    },
    kublerx: {
        id: 'kublerx',
        name: 'kublerx',
        displayName: 'Kublerx',
        description: 'Uniswap V3 DEX',
    },
}
