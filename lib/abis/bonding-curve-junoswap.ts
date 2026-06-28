import { zeroAddress, type Address } from 'viem'

// kub testnet (chain 25925) deployment.
export const BONDING_CURVE_JUNOSWAP_ADDRESS = '0x77e5D3fC554e30aceFd5322ca65beE15ee6E39a9' as const

// kub mainnet (chain 96) deployment (deployed 2026-06-28, block 32995517).
export const BONDING_CURVE_JUNOSWAP_BITKUB_ADDRESS =
    '0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e' as const

// Default launchpad chain — used as the fallback when no wallet is connected and by
// server paths that have no connected chain. Client code should prefer the connected
// chainId and resolve the address via getBondingCurveAddress().
export const BONDING_CURVE_JUNOSWAP_CHAIN_ID = 25925

const LAUNCHPAD_CHAIN_CONFIG: Record<number, { address: Address }> = {
    25925: { address: BONDING_CURVE_JUNOSWAP_ADDRESS },
    96: { address: BONDING_CURVE_JUNOSWAP_BITKUB_ADDRESS },
}

// Returns the bonding-curve address for a chain, or undefined if the chain has no
// (configured, non-zero) deployment. The zero-address guard keeps chain 96 inactive
// until its real address is filled in above.
export function getBondingCurveAddress(chainId: number): Address | undefined {
    const address = LAUNCHPAD_CHAIN_CONFIG[chainId]?.address
    return address && address !== zeroAddress ? address : undefined
}

export function isLaunchpadChain(chainId: number): boolean {
    return getBondingCurveAddress(chainId) !== undefined
}

// Chains with an active (deployed) launchpad, for callers that need to enumerate them.
export const LAUNCHPAD_CHAIN_IDS: number[] = Object.keys(LAUNCHPAD_CHAIN_CONFIG)
    .map(Number)
    .filter(isLaunchpadChain)

export const BONDING_CURVE_JUNOSWAP_ABI = [
    {
        type: 'function',
        name: 'createToken',
        stateMutability: 'payable',
        inputs: [
            { name: '_name', type: 'string' },
            { name: '_symbol', type: 'string' },
            { name: '_logo', type: 'string' },
            { name: '_description', type: 'string' },
            { name: '_link1', type: 'string' },
            { name: '_link2', type: 'string' },
            { name: '_link3', type: 'string' },
        ],
        outputs: [{ name: '', type: 'address' }],
    },
    {
        type: 'function',
        name: 'buy',
        stateMutability: 'payable',
        inputs: [
            { name: '_tokenAddr', type: 'address' },
            { name: '_minToken', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'sell',
        stateMutability: 'nonpayable',
        inputs: [
            { name: '_tokenAddr', type: 'address' },
            { name: '_tokenSold', type: 'uint256' },
            { name: '_minToken', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'graduate',
        stateMutability: 'nonpayable',
        inputs: [{ name: '_tokenAddr', type: 'address' }],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        type: 'function',
        name: 'getAmountOut',
        stateMutability: 'pure',
        inputs: [
            { name: '_inputAmount', type: 'uint256' },
            { name: '_inputReserve', type: 'uint256' },
            { name: '_outputReserve', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'pumpReserve',
        stateMutability: 'view',
        inputs: [{ name: '', type: 'address' }],
        outputs: [
            { name: 'native', type: 'uint256' },
            { name: 'token', type: 'uint256' },
        ],
    },
    {
        type: 'function',
        name: 'isGraduate',
        stateMutability: 'view',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        type: 'function',
        name: 'createFee',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'initialNative',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'virtualAmount',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'graduationAmount',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'pumpFee',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        type: 'event',
        name: 'Creation',
        inputs: [
            { name: 'creator', type: 'address', indexed: true },
            { name: 'tokenAddr', type: 'address', indexed: false },
            { name: 'logo', type: 'string', indexed: false },
            { name: 'description', type: 'string', indexed: false },
            { name: 'link1', type: 'string', indexed: false },
            { name: 'link2', type: 'string', indexed: false },
            { name: 'link3', type: 'string', indexed: false },
            { name: 'createdTime', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'Swap',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'isBuy', type: 'bool', indexed: true },
            { name: 'tokenAddr', type: 'address', indexed: true },
            { name: 'amountIn', type: 'uint256', indexed: false },
            { name: 'amountOut', type: 'uint256', indexed: false },
            { name: 'reserveIn', type: 'uint256', indexed: false },
            { name: 'reserveOut', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'Graduation',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'tokenAddr', type: 'address', indexed: false },
        ],
    },
] as const
