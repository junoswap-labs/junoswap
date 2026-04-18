import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Address } from 'viem'

const mockSwapAddress = '0xaaaaaaaa1234567890abcdef1234567890abcdef' as Address
const mockTokenA = '0xbbbbbbbb1234567890abcdef1234567890abcdef' as Address
const mockTokenB = '0xcccccccc1234567890abcdef1234567890abcdef' as Address
const nativeAddr = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address

vi.mock('@/services/tokens', () => ({
    getSwapAddress: vi.fn((addr: string) => {
        if (addr === nativeAddr) return mockSwapAddress
        return addr
    }),
}))

vi.mock('@/lib/dex-config', () => ({
    DEFAULT_FEE_TIER: 3000,
}))

vi.mock('@/lib/abis/uniswap-v3-swap-router', () => ({
    UNISWAP_V3_SWAP_ROUTER_ABI: [
        {
            name: 'exactInputSingle',
            type: 'function',
            inputs: [
                {
                    name: 'params',
                    type: 'tuple',
                    components: [
                        { name: 'tokenIn', type: 'address' },
                        { name: 'tokenOut', type: 'address' },
                        { name: 'fee', type: 'uint24' },
                        { name: 'recipient', type: 'address' },
                        { name: 'amountIn', type: 'uint256' },
                        { name: 'amountOutMinimum', type: 'uint256' },
                        { name: 'sqrtPriceLimitX96', type: 'uint160' },
                    ],
                },
            ],
            outputs: [{ name: 'amountOut', type: 'uint256' }],
            stateMutability: 'payable',
        },
        {
            name: 'unwrapWETH9',
            type: 'function',
            inputs: [
                { name: 'amountMinimum', type: 'uint256' },
                { name: 'recipient', type: 'address' },
            ],
            outputs: [],
            stateMutability: 'payable',
        },
        {
            name: 'exactInput',
            type: 'function',
            inputs: [
                {
                    name: 'params',
                    type: 'tuple',
                    components: [
                        { name: 'path', type: 'bytes' },
                        { name: 'recipient', type: 'address' },
                        { name: 'amountIn', type: 'uint256' },
                        { name: 'amountOutMinimum', type: 'uint256' },
                    ],
                },
            ],
            outputs: [{ name: 'amountOut', type: 'uint256' }],
            stateMutability: 'payable',
        },
    ],
}))

describe('services/dex/uniswap-v3', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function getModule() {
        return await import('@/services/dex/uniswap-v3')
    }

    describe('buildQuoteParams', () => {
        it('resolves swap addresses when chainId is provided', async () => {
            const { buildQuoteParams } = await getModule()
            const result = buildQuoteParams(nativeAddr, mockTokenB, 1000n, 3000, 96)
            expect(result.tokenIn).toBe(mockSwapAddress)
            expect(result.tokenOut).toBe(mockTokenB)
        })
    })

    describe('encodeV3Path', () => {
        it('encodes two tokens with one fee', async () => {
            const { encodeV3Path } = await getModule()
            const result = encodeV3Path([mockTokenA, mockTokenB], [3000])
            expect(result.length).toBe(43 * 2 + 2)
        })

        it('throws when tokens < 2', async () => {
            const { encodeV3Path } = await getModule()
            expect(() => encodeV3Path([mockTokenA], [])).toThrow('Path must have at least 2 tokens')
        })

        it('throws when fees length mismatch', async () => {
            const { encodeV3Path } = await getModule()
            expect(() => encodeV3Path([mockTokenA, mockTokenB], [100, 200])).toThrow(
                'Fees length must be tokens.length - 1'
            )
        })

        it('encodes three tokens with two fees (multi-hop)', async () => {
            const { encodeV3Path } = await getModule()
            const result = encodeV3Path([mockTokenA, mockTokenB, mockSwapAddress], [3000, 500])
            expect(result.length).toBe(66 * 2 + 2)
        })
    })

    describe('buildMulticallSwapToNative', () => {
        it('returns two encoded calls', async () => {
            const { buildMulticallSwapToNative } = await getModule()
            const result = buildMulticallSwapToNative(
                {
                    tokenIn: mockTokenA,
                    tokenOut: nativeAddr,
                    amountIn: 1000n,
                    amountOutMinimum: 500n,
                    recipient: '0xdddddddd1234567890abcdef1234567890abcdef' as Address,
                    slippageTolerance: 100,
                    deadline: 1700000000,
                },
                3000,
                96
            )
            expect(result).toHaveLength(2)
        })
    })
})
