export const UNISWAP_V2_FACTORY_ABI = [
    {
        type: 'event',
        name: 'PairCreated',
        inputs: [
            { name: 'token0', type: 'address', indexed: true },
            { name: 'token1', type: 'address', indexed: true },
            { name: 'pair', type: 'address', indexed: false },
            // Must be named: viem returns event args as a positional ARRAY (not a
            // named object) if ANY input is unnamed, which breaks `event.args.pair`.
            { name: 'allPairsLength', type: 'uint256', indexed: false },
        ],
    },
] as const
