import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Token } from '@/types/tokens'

const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const WRAPPED = '0xc0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0'

const tokenA: Token = {
    address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    symbol: 'AAA',
    name: 'Token A',
    decimals: 18,
    chainId: 1,
}
const tokenB: Token = {
    address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    symbol: 'BBB',
    name: 'Token B',
    decimals: 18,
    chainId: 1,
}
const nativeToken: Token = {
    address: NATIVE as `0x${string}`,
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    chainId: 1,
}

vi.mock('@/lib/wagmi', () => ({
    isNativeToken: vi.fn((addr: string) => addr === NATIVE),
}))

vi.mock('@/services/tokens', () => ({
    getWrappedNativeAddress: vi.fn(() => WRAPPED),
}))

describe('services/liquidity/add-liquidity', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function getModule() {
        return await import('@/services/liquidity/add-liquidity')
    }

    describe('buildMintParams', () => {
        it('preserves order when token0 < token1', async () => {
            const { buildMintParams } = await getModule()
            const result = buildMintParams({
                token0: tokenA,
                token1: tokenB,
                fee: 3000,
                tickLower: -1000,
                tickUpper: 1000,
                amount0Desired: 100n,
                amount1Desired: 200n,
                slippageTolerance: 100,
                deadline: 600,
                recipient: '0x1111111111111111111111111111111111111111',
            })
            expect(result.token0).toBe(tokenA.address)
            expect(result.token1).toBe(tokenB.address)
            expect(result.amount0Desired).toBe(100n)
            expect(result.amount1Desired).toBe(200n)
        })

        it('swaps tokens and amounts when token0 > token1', async () => {
            const { buildMintParams } = await getModule()
            const result = buildMintParams({
                token0: tokenB,
                token1: tokenA,
                fee: 3000,
                tickLower: -1000,
                tickUpper: 1000,
                amount0Desired: 100n,
                amount1Desired: 200n,
                slippageTolerance: 100,
                deadline: 600,
                recipient: '0x1111111111111111111111111111111111111111',
            })
            expect(result.token0).toBe(tokenA.address)
            expect(result.token1).toBe(tokenB.address)
            expect(result.amount0Desired).toBe(200n)
            expect(result.amount1Desired).toBe(100n)
        })

        it('aligns ticks to nearest usable tick', async () => {
            const { buildMintParams } = await getModule()
            const result = buildMintParams({
                token0: tokenA,
                token1: tokenB,
                fee: 3000,
                tickLower: -990,
                tickUpper: 990,
                amount0Desired: 100n,
                amount1Desired: 200n,
                slippageTolerance: 100,
                deadline: 600,
                recipient: '0x1111111111111111111111111111111111111111',
            })
            // fee=3000 → tickSpacing=60 → nearest usable ticks are multiples of 60
            expect(Math.abs(result.tickLower % 60)).toBe(0)
            expect(Math.abs(result.tickUpper % 60)).toBe(0)
        })
    })

    describe('buildIncreaseLiquidityParams', () => {
        it('applies slippage tolerance', async () => {
            const { buildIncreaseLiquidityParams } = await getModule()
            const result = buildIncreaseLiquidityParams({
                tokenId: 1n,
                amount0Desired: 10000n,
                amount1Desired: 20000n,
                slippageTolerance: 100, // 1%
                deadline: 600,
            })
            expect(result.amount0Min).toBe(9900n)
            expect(result.amount1Min).toBe(19800n)
        })
    })

    describe('buildMintWithNativeMulticall', () => {
        it('returns single mint with value=0n when no native token', async () => {
            const { buildMintWithNativeMulticall } = await getModule()
            const result = buildMintWithNativeMulticall(
                {
                    token0: tokenA,
                    token1: tokenB,
                    fee: 3000,
                    tickLower: -1000,
                    tickUpper: 1000,
                    amount0Desired: 100n,
                    amount1Desired: 200n,
                    slippageTolerance: 100,
                    deadline: 600,
                    recipient: '0x1111111111111111111111111111111111111111',
                },
                1
            )
            expect(result.data).toHaveLength(1)
            expect(result.value).toBe(0n)
        })

        it('replaces native token0 with wrapped, adds refundETH', async () => {
            const { buildMintWithNativeMulticall } = await getModule()
            const result = buildMintWithNativeMulticall(
                {
                    token0: nativeToken,
                    token1: tokenA,
                    fee: 3000,
                    tickLower: -1000,
                    tickUpper: 1000,
                    amount0Desired: 500n,
                    amount1Desired: 200n,
                    slippageTolerance: 100,
                    deadline: 600,
                    recipient: '0x1111111111111111111111111111111111111111',
                },
                1
            )
            expect(result.data).toHaveLength(2) // mint + refundETH
            expect(result.value).toBe(500n)
        })
    })

    describe('buildPoolCreationMulticall', () => {
        it('bundles createPool + mint + refundETH when native token', async () => {
            const { buildPoolCreationMulticall } = await getModule()
            const result = buildPoolCreationMulticall(
                {
                    token0: nativeToken,
                    token1: tokenA,
                    fee: 3000,
                    tickLower: -1000,
                    tickUpper: 1000,
                    amount0Desired: 500n,
                    amount1Desired: 200n,
                    slippageTolerance: 100,
                    deadline: 600,
                    recipient: '0x1111111111111111111111111111111111111111',
                },
                1,
                79228162514264337593543950336n
            )
            // createAndInitializePool + mint + refundETH
            expect(result.data).toHaveLength(3)
            expect(result.value).toBe(500n)
        })

        it('bundles createPool + single mint when no native token', async () => {
            const { buildPoolCreationMulticall } = await getModule()
            const result = buildPoolCreationMulticall(
                {
                    token0: tokenA,
                    token1: tokenB,
                    fee: 3000,
                    tickLower: -1000,
                    tickUpper: 1000,
                    amount0Desired: 100n,
                    amount1Desired: 200n,
                    slippageTolerance: 100,
                    deadline: 600,
                    recipient: '0x1111111111111111111111111111111111111111',
                },
                1,
                79228162514264337593543950336n
            )
            // createAndInitializePool + mint (no refundETH)
            expect(result.data).toHaveLength(2)
            expect(result.value).toBe(0n)
        })
    })

    describe('buildIncreaseLiquidityWithNativeMulticall', () => {
        it('returns single call with value=0n when no native', async () => {
            const { buildIncreaseLiquidityWithNativeMulticall } = await getModule()
            const result = buildIncreaseLiquidityWithNativeMulticall(
                {
                    tokenId: 1n,
                    amount0Desired: 100n,
                    amount1Desired: 200n,
                    slippageTolerance: 100,
                    deadline: 600,
                },
                false,
                0n
            )
            expect(result.data).toHaveLength(1)
            expect(result.value).toBe(0n)
        })

        it('adds refundETH and sets value when has native', async () => {
            const { buildIncreaseLiquidityWithNativeMulticall } = await getModule()
            const result = buildIncreaseLiquidityWithNativeMulticall(
                {
                    tokenId: 1n,
                    amount0Desired: 100n,
                    amount1Desired: 200n,
                    slippageTolerance: 100,
                    deadline: 600,
                },
                true,
                100n
            )
            expect(result.data).toHaveLength(2)
            expect(result.value).toBe(100n)
        })
    })
})
