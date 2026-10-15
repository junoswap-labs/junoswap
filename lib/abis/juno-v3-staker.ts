// Generated from v3staker/juno artifacts — do not edit by hand.
export const JUNO_V3_STAKER_ABI = [
    {
        type: 'constructor',
        inputs: [
            {
                name: '_factory',
                type: 'address',
                internalType: 'contract IUniswapV3Factory',
            },
            {
                name: '_nonfungiblePositionManager',
                type: 'address',
                internalType: 'contract INonfungiblePositionManager',
            },
            {
                name: '_maxIncentiveStartLeadTime',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: '_maxIncentiveDuration',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'claimReward',
        inputs: [
            {
                name: 'rewardToken',
                type: 'address',
                internalType: 'contract IERC20Minimal',
            },
            {
                name: 'to',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'amountRequested',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: 'reward',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'createIncentive',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                internalType: 'struct IJunoswapV3Staker.IncentiveKey',
                components: [
                    {
                        name: 'rewardToken',
                        type: 'address',
                        internalType: 'contract IERC20Minimal',
                    },
                    {
                        name: 'pool',
                        type: 'address',
                        internalType: 'contract IUniswapV3Pool',
                    },
                    {
                        name: 'startTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'endTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'refundee',
                        type: 'address',
                        internalType: 'address',
                    },
                ],
            },
            {
                name: 'reward',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'deposits',
        inputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: 'owner',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'numberOfStakes',
                type: 'uint48',
                internalType: 'uint48',
            },
            {
                name: 'tickLower',
                type: 'int24',
                internalType: 'int24',
            },
            {
                name: 'tickUpper',
                type: 'int24',
                internalType: 'int24',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'endIncentive',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                internalType: 'struct IJunoswapV3Staker.IncentiveKey',
                components: [
                    {
                        name: 'rewardToken',
                        type: 'address',
                        internalType: 'contract IERC20Minimal',
                    },
                    {
                        name: 'pool',
                        type: 'address',
                        internalType: 'contract IUniswapV3Pool',
                    },
                    {
                        name: 'startTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'endTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'refundee',
                        type: 'address',
                        internalType: 'address',
                    },
                ],
            },
        ],
        outputs: [
            {
                name: 'refund',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'factory',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'contract IUniswapV3Factory',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'finalizeStake',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                internalType: 'struct IJunoswapV3Staker.IncentiveKey',
                components: [
                    {
                        name: 'rewardToken',
                        type: 'address',
                        internalType: 'contract IERC20Minimal',
                    },
                    {
                        name: 'pool',
                        type: 'address',
                        internalType: 'contract IUniswapV3Pool',
                    },
                    {
                        name: 'startTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'endTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'refundee',
                        type: 'address',
                        internalType: 'address',
                    },
                ],
            },
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'getRewardInfo',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                internalType: 'struct IJunoswapV3Staker.IncentiveKey',
                components: [
                    {
                        name: 'rewardToken',
                        type: 'address',
                        internalType: 'contract IERC20Minimal',
                    },
                    {
                        name: 'pool',
                        type: 'address',
                        internalType: 'contract IUniswapV3Pool',
                    },
                    {
                        name: 'startTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'endTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'refundee',
                        type: 'address',
                        internalType: 'address',
                    },
                ],
            },
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: 'reward',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'secondsInsideStaked',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'incentives',
        inputs: [
            {
                name: '',
                type: 'bytes32',
                internalType: 'bytes32',
            },
        ],
        outputs: [
            {
                name: 'totalReward',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'totalRewardUnclaimed',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'rewardPerLiquidityX128',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'stakedLiquidity',
                type: 'uint128',
                internalType: 'uint128',
            },
            {
                name: 'lastUpdateTime',
                type: 'uint64',
                internalType: 'uint64',
            },
            {
                name: 'numberOfStakes',
                type: 'uint64',
                internalType: 'uint64',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'minRangeSpacings',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'stakeEligibility',
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
            { name: 'eligible', type: 'bool' },
            { name: 'reason', type: 'string' },
        ],
    },
    {
        type: 'function',
        name: 'maxIncentiveDuration',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'maxIncentiveStartLeadTime',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'multicall',
        inputs: [
            {
                name: 'data',
                type: 'bytes[]',
                internalType: 'bytes[]',
            },
        ],
        outputs: [
            {
                name: 'results',
                type: 'bytes[]',
                internalType: 'bytes[]',
            },
        ],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'nonfungiblePositionManager',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'contract INonfungiblePositionManager',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'onERC721Received',
        inputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'from',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'data',
                type: 'bytes',
                internalType: 'bytes',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'bytes4',
                internalType: 'bytes4',
            },
        ],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'rewards',
        inputs: [
            {
                name: '',
                type: 'address',
                internalType: 'contract IERC20Minimal',
            },
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'stakeToken',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                internalType: 'struct IJunoswapV3Staker.IncentiveKey',
                components: [
                    {
                        name: 'rewardToken',
                        type: 'address',
                        internalType: 'contract IERC20Minimal',
                    },
                    {
                        name: 'pool',
                        type: 'address',
                        internalType: 'contract IUniswapV3Pool',
                    },
                    {
                        name: 'startTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'endTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'refundee',
                        type: 'address',
                        internalType: 'address',
                    },
                ],
            },
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'stakes',
        inputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: '',
                type: 'bytes32',
                internalType: 'bytes32',
            },
        ],
        outputs: [
            {
                name: 'rewardPerLiquidityInitialX128',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'secondsInsideInitial',
                type: 'uint32',
                internalType: 'uint32',
            },
            {
                name: 'stakeTime',
                type: 'uint32',
                internalType: 'uint32',
            },
            {
                name: 'liquidity',
                type: 'uint128',
                internalType: 'uint128',
            },
            {
                name: 'secondsInsideFinal',
                type: 'uint32',
                internalType: 'uint32',
            },
            {
                name: 'finalized',
                type: 'bool',
                internalType: 'bool',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'transferDeposit',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'to',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'unstakeToken',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                internalType: 'struct IJunoswapV3Staker.IncentiveKey',
                components: [
                    {
                        name: 'rewardToken',
                        type: 'address',
                        internalType: 'contract IERC20Minimal',
                    },
                    {
                        name: 'pool',
                        type: 'address',
                        internalType: 'contract IUniswapV3Pool',
                    },
                    {
                        name: 'startTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'endTime',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'refundee',
                        type: 'address',
                        internalType: 'address',
                    },
                ],
            },
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'withdrawToken',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'to',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'data',
                type: 'bytes',
                internalType: 'bytes',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'event',
        name: 'DepositTransferred',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'oldOwner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'newOwner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'IncentiveCreated',
        inputs: [
            {
                name: 'rewardToken',
                type: 'address',
                indexed: true,
                internalType: 'contract IERC20Minimal',
            },
            {
                name: 'pool',
                type: 'address',
                indexed: true,
                internalType: 'contract IUniswapV3Pool',
            },
            {
                name: 'startTime',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'endTime',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'refundee',
                type: 'address',
                indexed: false,
                internalType: 'address',
            },
            {
                name: 'reward',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'IncentiveEnded',
        inputs: [
            {
                name: 'incentiveId',
                type: 'bytes32',
                indexed: true,
                internalType: 'bytes32',
            },
            {
                name: 'refund',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'RewardClaimed',
        inputs: [
            {
                name: 'to',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'reward',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'StakeFinalized',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'incentiveId',
                type: 'bytes32',
                indexed: true,
                internalType: 'bytes32',
            },
            {
                name: 'secondsInside',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'TokenStaked',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'incentiveId',
                type: 'bytes32',
                indexed: true,
                internalType: 'bytes32',
            },
            {
                name: 'liquidity',
                type: 'uint128',
                indexed: false,
                internalType: 'uint128',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'TokenUnstaked',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'incentiveId',
                type: 'bytes32',
                indexed: true,
                internalType: 'bytes32',
            },
            {
                name: 'reward',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
] as const
