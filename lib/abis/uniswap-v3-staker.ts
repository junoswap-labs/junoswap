// Canonical Uniswap V3 Staker, narrowed to the members this app calls. The Juno staker shares
// these signatures, so calldata built here is valid against both — see lib/earn-programs.ts.
export const UNISWAP_V3_STAKER_ABI = [
    {
        type: 'function',
        name: 'unstakeToken',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                components: [
                    { name: 'rewardToken', type: 'address' },
                    { name: 'pool', type: 'address' },
                    { name: 'startTime', type: 'uint256' },
                    { name: 'endTime', type: 'uint256' },
                    { name: 'refundee', type: 'address' },
                ],
            },
            { name: 'tokenId', type: 'uint256' },
        ],
        outputs: [],
    },

    {
        type: 'function',
        name: 'claimReward',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'rewardToken', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'amountRequested', type: 'uint256' },
        ],
        outputs: [{ name: 'reward', type: 'uint256' }],
    },

    {
        type: 'function',
        name: 'withdrawToken',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'tokenId', type: 'uint256' },
            { name: 'to', type: 'address' },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [],
    },

    {
        type: 'function',
        name: 'multicall',
        stateMutability: 'payable',
        inputs: [{ name: 'data', type: 'bytes[]' }],
        outputs: [{ name: 'results', type: 'bytes[]' }],
    },

    {
        type: 'function',
        name: 'getRewardInfo',
        stateMutability: 'view',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                components: [
                    { name: 'rewardToken', type: 'address' },
                    { name: 'pool', type: 'address' },
                    { name: 'startTime', type: 'uint256' },
                    { name: 'endTime', type: 'uint256' },
                    { name: 'refundee', type: 'address' },
                ],
            },
            { name: 'tokenId', type: 'uint256' },
        ],
        outputs: [
            { name: 'reward', type: 'uint256' },
            { name: 'secondsInsideX128', type: 'uint160' },
        ],
    },

    {
        type: 'function',
        name: 'deposits',
        stateMutability: 'view',
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        outputs: [
            { name: 'owner', type: 'address' },
            { name: 'numberOfStakes', type: 'uint48' },
            { name: 'tickLower', type: 'int24' },
            { name: 'tickUpper', type: 'int24' },
        ],
    },

    {
        type: 'function',
        name: 'incentives',
        stateMutability: 'view',
        inputs: [{ name: 'incentiveId', type: 'bytes32' }],
        outputs: [
            { name: 'totalRewardUnclaimed', type: 'uint256' },
            { name: 'totalSecondsClaimedX128', type: 'uint160' },
            { name: 'numberOfStakes', type: 'uint96' },
        ],
    },

    {
        type: 'function',
        name: 'stakes',
        stateMutability: 'view',
        inputs: [
            { name: 'tokenId', type: 'uint256' },
            { name: 'incentiveId', type: 'bytes32' },
        ],
        outputs: [
            { name: 'secondsPerLiquidityInsideInitialX128', type: 'uint160' },
            { name: 'liquidity', type: 'uint128' },
        ],
    },
] as const
