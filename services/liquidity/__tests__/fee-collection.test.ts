import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MAX_UINT128 } from '@/types/earn'

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

describe('services/liquidity/fee-collection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function getModule() {
        return await import('@/services/liquidity/fee-collection')
    }

    describe('buildCollectFeesParams', () => {
        it('sets amount0Max and amount1Max to MAX_UINT128', async () => {
            const { buildCollectFeesParams } = await getModule()
            const result = buildCollectFeesParams(1n, RECIPIENT as `0x${string}`)
            expect(result.tokenId).toBe(1n)
            expect(result.recipient).toBe(RECIPIENT)
            expect(result.amount0Max).toBe(MAX_UINT128)
            expect(result.amount1Max).toBe(MAX_UINT128)
        })
    })

    describe('buildCollectWithUnwrapMulticall', () => {
        it('returns single collect when no wrapped native', async () => {
            const { buildCollectWithUnwrapMulticall } = await getModule()
            const calls = buildCollectWithUnwrapMulticall(
                1n,
                RECIPIENT as `0x${string}`,
                TOKEN0 as `0x${string}`,
                TOKEN1 as `0x${string}`,
                1
            )
            expect(calls).toHaveLength(1)
        })

        it('returns single collect when skipUnwrap=true', async () => {
            const { buildCollectWithUnwrapMulticall } = await getModule()
            const calls = buildCollectWithUnwrapMulticall(
                1n,
                RECIPIENT as `0x${string}`,
                TOKEN0 as `0x${string}`,
                WRAPPED as `0x${string}`,
                96
            )
            expect(calls).toHaveLength(1)
        })

        it('returns 3 calls when has wrapped native and not skipUnwrap', async () => {
            const { buildCollectWithUnwrapMulticall } = await getModule()
            const calls = buildCollectWithUnwrapMulticall(
                1n,
                RECIPIENT as `0x${string}`,
                WRAPPED as `0x${string}`,
                TOKEN1 as `0x${string}`,
                1
            )
            expect(calls).toHaveLength(3)
        })
    })
})
