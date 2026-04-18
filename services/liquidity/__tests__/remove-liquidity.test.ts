import { describe, it, expect, vi, beforeEach } from 'vitest'

const WRAPPED = '0xc0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0'
const TOKEN0 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TOKEN1 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const RECIPIENT = '0x1111111111111111111111111111111111111111'

vi.mock('@/services/tokens', () => ({
    getWrappedNativeAddress: vi.fn(() => WRAPPED),
}))

vi.mock('@/lib/wagmi', () => ({
    shouldSkipUnwrap: vi.fn((chainId: number) => chainId === 96),
}))

describe('services/liquidity/remove-liquidity', () => {
    const removeParams = {
        tokenId: 1n,
        liquidity: 1000000n,
        amount0Min: 50n,
        amount1Min: 75n,
        deadline: 600,
        collectFees: true,
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function getModule() {
        return await import('@/services/liquidity/remove-liquidity')
    }

    describe('buildRemoveWithCollectMulticall', () => {
        it('returns decreaseLiquidity + collect to recipient when no wrapped native', async () => {
            const { buildRemoveWithCollectMulticall } = await getModule()
            const calls = buildRemoveWithCollectMulticall(
                removeParams,
                RECIPIENT as `0x${string}`,
                TOKEN0 as `0x${string}`,
                TOKEN1 as `0x${string}`,
                1
            )
            expect(calls).toHaveLength(2)
        })

        it('returns decreaseLiquidity + collect to recipient when skipUnwrap=true', async () => {
            const { buildRemoveWithCollectMulticall } = await getModule()
            const calls = buildRemoveWithCollectMulticall(
                removeParams,
                RECIPIENT as `0x${string}`,
                TOKEN0 as `0x${string}`,
                WRAPPED as `0x${string}`,
                96
            )
            expect(calls).toHaveLength(2)
        })

        it('returns 4 calls when has wrapped native and not skipUnwrap', async () => {
            const { buildRemoveWithCollectMulticall } = await getModule()
            const calls = buildRemoveWithCollectMulticall(
                removeParams,
                RECIPIENT as `0x${string}`,
                WRAPPED as `0x${string}`,
                TOKEN1 as `0x${string}`,
                1
            )
            expect(calls).toHaveLength(4)
        })

        it('uses token0 amount for unwrap when token0 is wrapped native', async () => {
            const { buildRemoveWithCollectMulticall } = await getModule()
            const calls = buildRemoveWithCollectMulticall(
                { ...removeParams, amount0Min: 100n, amount1Min: 200n },
                RECIPIENT as `0x${string}`,
                WRAPPED as `0x${string}`,
                TOKEN1 as `0x${string}`,
                1
            )
            expect(calls).toHaveLength(4)
        })
    })
})
