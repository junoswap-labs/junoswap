export const UNISWAP_V3_FACTORY_ABI = [
    {
        type: 'function',
        name: 'getPool',
        stateMutability: 'view',
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'fee', type: 'uint24' },
        ],
        outputs: [{ name: 'pool', type: 'address' }],
    },
    {
        type: 'function',
        name: 'createPool',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'fee', type: 'uint24' },
        ],
        outputs: [{ name: 'pool', type: 'address' }],
    },
    {
        type: 'event',
        name: 'PoolCreated',
        inputs: [
            { name: 'token0', type: 'address', indexed: true },
            { name: 'token1', type: 'address', indexed: true },
            { name: 'fee', type: 'uint24', indexed: true },
            { name: 'pool', type: 'address', indexed: false },
            { name: 'tickSpacing', type: 'int24', indexed: false },
        ],
    },
] as const
