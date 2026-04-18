import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSwapAddress = '0xWrapped1234567890abcdef1234567890ab' as `0x${string}`
const mockTokenB = '0xTokenB1234567890abcdef1234567890abcd' as `0x${string}`
const nativeAddr = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as `0x${string}`

vi.mock('@/services/tokens', () => ({
    getSwapAddress: vi.fn((addr: string) => {
        if (addr === nativeAddr) return mockSwapAddress
        return addr
    }),
}))

vi.mock('@/lib/wagmi', () => ({
    isNativeToken: vi.fn((addr: string) => addr === nativeAddr),
}))

describe('services/dex/uniswap-v2', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function getModule() {
        return await import('@/services/dex/uniswap-v2')
    }

    describe('buildSwapPath', () => {
        it('replaces native token with swap address', async () => {
            const { buildSwapPath } = await getModule()
            const path = buildSwapPath(nativeAddr, mockTokenB, 96)
            expect(path).toEqual([mockSwapAddress, mockTokenB])
        })

        it('uses custom wnative for native tokens', async () => {
            const { buildSwapPath } = await getModule()
            const customWnative = '0xCustomWnative1234567890abcdef1234' as `0x${string}`
            const path = buildSwapPath(nativeAddr, mockTokenB, 96, customWnative)
            expect(path[0]).toBe(customWnative)
        })
    })

    describe('buildMultiHopSwapPath', () => {
        it('replaces native with wnative when provided', async () => {
            const { buildMultiHopSwapPath } = await getModule()
            const customWnative = '0xCustomWnative1234567890abcdef1234' as `0x${string}`
            const path = buildMultiHopSwapPath([nativeAddr, mockTokenB], 96, customWnative)
            expect(path[0]).toBe(customWnative)
        })
    })
})
