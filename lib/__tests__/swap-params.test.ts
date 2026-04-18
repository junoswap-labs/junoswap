import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Token } from '@/types/tokens'

const mockToken: Token = {
    address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
    symbol: 'TKN',
    name: 'Token',
    decimals: 18,
    chainId: 96,
}

const mockToken2: Token = {
    address: '0xabcdef1234567890abcdef1234567890abcdef12' as `0x${string}`,
    symbol: 'TKN2',
    name: 'Token 2',
    decimals: 18,
    chainId: 96,
}

vi.mock('@/lib/tokens', () => ({
    findTokenByAddress: vi.fn((_chainId: number, addr: string) => {
        if (addr === mockToken.address) return mockToken
        if (addr === mockToken2.address) return mockToken2
        if (addr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return mockToken
        return undefined
    }),
}))

vi.mock('@/lib/wagmi', () => ({
    isNativeToken: vi.fn((addr: string) => addr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
}))

vi.mock('@/services/tokens', () => ({
    isValidTokenAddress: vi.fn((addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr)),
}))

describe('lib/swap-params', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function getModule() {
        return await import('@/lib/swap-params')
    }

    describe('parseAndValidateSwapParams', () => {
        it('returns valid result with resolved tokens', async () => {
            const { parseAndValidateSwapParams } = await getModule()
            const result = parseAndValidateSwapParams(96, {
                input: mockToken.address,
                output: mockToken2.address,
                amount: '1.5',
            })
            expect(result.isValid).toBe(true)
            expect(result.errors).toHaveLength(0)
            expect(result.amountIn).toBe('1.5')
        })

        it('returns error for unknown token address', async () => {
            const { parseAndValidateSwapParams } = await getModule()
            const result = parseAndValidateSwapParams(96, {
                input: '0xdeadbeef1234567890abcdef1234567890abcdef',
            })
            expect(result.isValid).toBe(false)
            expect(result.errors.length).toBeGreaterThan(0)
        })

        it('returns error when input and output are the same', async () => {
            const { parseAndValidateSwapParams } = await getModule()
            const result = parseAndValidateSwapParams(96, {
                input: mockToken.address,
                output: mockToken.address,
            })
            expect(result.isValid).toBe(false)
            expect(result.errors).toContain('Input and output tokens cannot be the same')
        })

        it('uses target chain from URL params', async () => {
            const { parseAndValidateSwapParams } = await getModule()
            const result = parseAndValidateSwapParams(1, {
                input: mockToken.address,
                output: mockToken2.address,
                chain: '96',
            })
            expect(result.targetChainId).toBe(96)
        })
    })
})
