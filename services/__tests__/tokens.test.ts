import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Token } from '@/types/tokens'

const mockNativeToken: Token = {
    address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as `0x${string}`,
    symbol: 'KUB',
    name: 'KUB Token',
    decimals: 18,
    chainId: 96,
}

const mockWrappedToken: Token = {
    address: '0xWrappedNative1234567890abcdef1234567890' as `0x${string}`,
    symbol: 'WKUB',
    name: 'Wrapped KUB',
    decimals: 18,
    chainId: 96,
}

const mockUsdc: Token = {
    address: '0xUsdcToken1234567890abcdef1234567890ab' as `0x${string}`,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    chainId: 96,
}

vi.mock('@/lib/wagmi', () => ({
    isNativeToken: vi.fn((addr: string) => addr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
}))

vi.mock('@/lib/tokens', () => ({
    TOKEN_LISTS: {
        96: [mockNativeToken, mockWrappedToken, mockUsdc],
    },
}))

vi.mock('@/lib/abis/erc20', () => ({
    ERC20_ABI: [],
}))

describe('services/tokens', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    // Dynamic imports to ensure mocks are applied
    async function getModule() {
        return await import('@/services/tokens')
    }

    describe('buildInfiniteApprovalParams', () => {
        it('returns correct config', async () => {
            const { buildInfiniteApprovalParams } = await getModule()
            const result = buildInfiniteApprovalParams(
                '0xToken1234567890abcdef1234567890abcdef12' as `0x${string}`,
                '0xSpender1234567890abcdef1234567890abcdef' as `0x${string}`
            )
            expect(result.functionName).toBe('approve')
            expect(result.args[1]).toBe(2n ** 256n - 1n)
        })
    })

    describe('formatTokenAmount', () => {
        it('formats whole number correctly', async () => {
            const { formatTokenAmount } = await getModule()
            expect(formatTokenAmount(1n * 10n ** 18n, 18)).toBe('1')
        })

        it('formats zero', async () => {
            const { formatTokenAmount } = await getModule()
            expect(formatTokenAmount(0n, 18)).toBe('0')
        })

        it('strips trailing zeros', async () => {
            const { formatTokenAmount } = await getModule()
            // 1.5 tokens with 18 decimals
            const result = formatTokenAmount(15n * 10n ** 17n, 18)
            expect(result).toBe('1.5')
        })
    })

    describe('formatDisplayAmount', () => {
        it('truncates to max decimals', async () => {
            const { formatDisplayAmount } = await getModule()
            // 1.123456789 with 18 decimals
            const amount = 1n * 10n ** 18n + 123456789n * 10n ** 9n
            const result = formatDisplayAmount(amount, 18)
            // Should truncate to 6 decimals max
            expect(result).not.toContain('789')
        })

        it('returns whole number when no fraction', async () => {
            const { formatDisplayAmount } = await getModule()
            expect(formatDisplayAmount(1n * 10n ** 18n, 18)).toBe('1')
        })
    })

    describe('formatBalance', () => {
        it('returns "0" for zero', async () => {
            const { formatBalance } = await getModule()
            expect(formatBalance(0n, 18)).toBe('0')
        })

        it('formats small numbers with 6 decimals max', async () => {
            const { formatBalance } = await getModule()
            // 0.5 token
            const result = formatBalance(5n * 10n ** 17n, 18)
            expect(result).toBe('0.5')
        })

        it('formats medium numbers with 4 decimals max', async () => {
            const { formatBalance } = await getModule()
            // 100.1234 tokens
            const result = formatBalance(1001234n * 10n ** 14n, 18)
            expect(result).toBe('100.1234')
        })

        it('formats large numbers with K suffix', async () => {
            const { formatBalance } = await getModule()
            const result = formatBalance(1500n * 10n ** 18n, 18)
            expect(result).toBe('1.50K')
        })

        it('formats millions with M suffix', async () => {
            const { formatBalance } = await getModule()
            const result = formatBalance(1500000n * 10n ** 18n, 18)
            expect(result).toBe('1.50M')
        })

        it('formats billions with B suffix', async () => {
            const { formatBalance } = await getModule()
            const result = formatBalance(1500000000n * 10n ** 18n, 18)
            expect(result).toBe('1.50B')
        })
    })

    describe('parseTokenAmount', () => {
        it('parses "1.5" with 18 decimals', async () => {
            const { parseTokenAmount } = await getModule()
            const result = parseTokenAmount('1.5', 18)
            expect(result).toBe(15n * 10n ** 17n)
        })
    })

    describe('getWrappedNativeAddress', () => {
        it('returns index-1 token from TOKEN_LISTS', async () => {
            const { getWrappedNativeAddress } = await getModule()
            expect(getWrappedNativeAddress(96)).toBe(mockWrappedToken.address)
        })

        it('throws for unknown chain', async () => {
            const { getWrappedNativeAddress } = await getModule()
            expect(() => getWrappedNativeAddress(99999)).toThrow()
        })
    })

    describe('getSwapAddress', () => {
        it('returns wrapped address for native token', async () => {
            const { getSwapAddress } = await getModule()
            expect(getSwapAddress(mockNativeToken.address as `0x${string}`, 96)).toBe(
                mockWrappedToken.address
            )
        })
    })

    describe('isSameToken', () => {
        it('returns false when either token is null', async () => {
            const { isSameToken } = await getModule()
            expect(isSameToken(mockUsdc, null)).toBe(false)
            expect(isSameToken(null, mockUsdc)).toBe(false)
            expect(isSameToken(null, null)).toBe(false)
        })

        it('returns false for tokens on different chains', async () => {
            const { isSameToken } = await getModule()
            const diffChainToken = { ...mockUsdc, chainId: 1 }
            expect(isSameToken(mockUsdc, diffChainToken)).toBe(false)
        })

        it('returns true for identical tokens', async () => {
            const { isSameToken } = await getModule()
            expect(isSameToken(mockUsdc, mockUsdc)).toBe(true)
        })
    })

    describe('isNativeWrappedPair', () => {
        it('returns false when either token is null', async () => {
            const { isNativeWrappedPair } = await getModule()
            expect(isNativeWrappedPair(mockNativeToken, null)).toBe(false)
        })

        it('returns false for tokens on different chains', async () => {
            const { isNativeWrappedPair } = await getModule()
            const diffChainWrapped = { ...mockWrappedToken, chainId: 1 }
            expect(isNativeWrappedPair(mockNativeToken, diffChainWrapped)).toBe(false)
        })

        it('returns true for native-wrapped pair', async () => {
            const { isNativeWrappedPair } = await getModule()
            expect(isNativeWrappedPair(mockNativeToken, mockWrappedToken)).toBe(true)
            expect(isNativeWrappedPair(mockWrappedToken, mockNativeToken)).toBe(true)
        })

        it('returns false for native-ERC20 pair', async () => {
            const { isNativeWrappedPair } = await getModule()
            expect(isNativeWrappedPair(mockNativeToken, mockUsdc)).toBe(false)
        })
    })

    describe('getWrapOperation', () => {
        it('returns "wrap" when input is native', async () => {
            const { getWrapOperation } = await getModule()
            expect(getWrapOperation(mockNativeToken, mockWrappedToken)).toBe('wrap')
        })

        it('returns "unwrap" when output is native', async () => {
            const { getWrapOperation } = await getModule()
            expect(getWrapOperation(mockWrappedToken, mockNativeToken)).toBe('unwrap')
        })

        it('returns null when not a native-wrapped pair', async () => {
            const { getWrapOperation } = await getModule()
            expect(getWrapOperation(mockUsdc, mockNativeToken)).toBe(null)
        })

        it('returns null when either token is null', async () => {
            const { getWrapOperation } = await getModule()
            expect(getWrapOperation(null, mockWrappedToken)).toBe(null)
        })
    })
})
