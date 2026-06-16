import { encodeFunctionData, encodeAbiParameters, keccak256, type Address, type Hex } from 'viem'
import type { IncentiveKey, UnstakeParams } from '@/types/earn'
import { UNISWAP_V3_STAKER_ABI } from '@/lib/abis/uniswap-v3-staker'

/**
 * Compute the incentive ID from an IncentiveKey
 * This is the keccak256 hash of the encoded IncentiveKey struct
 */
export function computeIncentiveId(key: IncentiveKey): `0x${string}` {
    return keccak256(
        encodeAbiParameters(
            [
                { type: 'address', name: 'rewardToken' },
                { type: 'address', name: 'pool' },
                { type: 'uint256', name: 'startTime' },
                { type: 'uint256', name: 'endTime' },
                { type: 'address', name: 'refundee' },
            ],
            [key.rewardToken, key.pool, BigInt(key.startTime), BigInt(key.endTime), key.refundee]
        )
    )
}

/**
 * Encode the IncentiveKey for use as safeTransferFrom data parameter
 * When transferring NFT to staker with this data, it will deposit and stake in one tx
 */
export function encodeIncentiveKeyData(key: IncentiveKey): Hex {
    return encodeAbiParameters(
        [
            {
                type: 'tuple',
                components: [
                    { type: 'address', name: 'rewardToken' },
                    { type: 'address', name: 'pool' },
                    { type: 'uint256', name: 'startTime' },
                    { type: 'uint256', name: 'endTime' },
                    { type: 'address', name: 'refundee' },
                ],
            },
        ],
        [
            {
                rewardToken: key.rewardToken,
                pool: key.pool,
                startTime: BigInt(key.startTime),
                endTime: BigInt(key.endTime),
                refundee: key.refundee,
            },
        ]
    )
}

/**
 * Encode unstakeToken call
 */
function encodeUnstakeToken(params: UnstakeParams): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'unstakeToken',
        args: [
            {
                rewardToken: params.incentiveKey.rewardToken,
                pool: params.incentiveKey.pool,
                startTime: BigInt(params.incentiveKey.startTime),
                endTime: BigInt(params.incentiveKey.endTime),
                refundee: params.incentiveKey.refundee,
            },
            params.tokenId,
        ],
    })
}

/**
 * Encode withdrawToken call to return NFT to owner
 */
function encodeWithdrawToken(tokenId: bigint, to: Address): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'withdrawToken',
        args: [tokenId, to, '0x'],
    })
}

/**
 * Encode claimReward call
 */
function encodeClaimReward(rewardToken: Address, to: Address, amountRequested: bigint): Hex {
    return encodeFunctionData({
        abi: UNISWAP_V3_STAKER_ABI,
        functionName: 'claimReward',
        args: [rewardToken, to, amountRequested],
    })
}

/**
 * Build multicall data for unstake + claim + withdraw in one transaction
 * This is the full exit flow for a staked position
 */
export function buildUnstakeAndWithdrawMulticall(
    tokenId: bigint,
    incentiveKey: IncentiveKey,
    recipient: Address
): Hex[] {
    return [
        encodeUnstakeToken({ tokenId, incentiveKey }),
        encodeClaimReward(incentiveKey.rewardToken, recipient, 0n), // 0n = claim all
        encodeWithdrawToken(tokenId, recipient),
    ]
}

/**
 * Build multicall data for just unstake + claim (keep position deposited)
 */
export function buildUnstakeAndClaimMulticall(
    tokenId: bigint,
    incentiveKey: IncentiveKey,
    recipient: Address
): Hex[] {
    return [
        encodeUnstakeToken({ tokenId, incentiveKey }),
        encodeClaimReward(incentiveKey.rewardToken, recipient, 0n),
    ]
}
