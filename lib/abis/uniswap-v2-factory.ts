/**
 * Uniswap V2 Factory ABI
 * Used for pair lookups
 */
export const UNISWAP_V2_FACTORY_ABI = [
    {
        type: 'function',
        name: 'getPair',
        stateMutability: 'view',
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
        ],
        outputs: [{ name: 'pair', type: 'address' }],
    },
    {
        type: 'function',
        name: 'allPairsLength',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const
