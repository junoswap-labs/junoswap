import { describe, it, expect, vi } from 'vitest'
import type { Address } from 'viem'
import {
    TOKEN_LISTS,
    buildInfiniteApprovalParams,
    formatTokenAmount,
    formatDisplayAmount,
    formatBalance,
    parseTokenAmount,
    findWrappedNativeAddress,
    getWrappedNativeAddress,
    getSwapAddress,
    isSameToken,
    getWrapOperation,
} from '@/lib/tokens'

vi.mock('@coshi190/juno-moneta-sdk', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getAbi: () => [],
}))

describe('lib/tokens', () => {
    // bitkub = chain 96. By registry invariant, index 0 is native (0xeee…) and index 1 is the
    // wrapped native — the contract every helper below relies on. Deriving fixtures from the
    // real registry keeps these tests honest as tokens.json evolves.
    const bitkub = TOKEN_LISTS[96]!
    const native = bitkub[0]!
    const wrapped = bitkub[1]!
    const stable = bitkub.find((t) => t.symbol === 'KUSDT')!

    describe('buildInfiniteApprovalParams', () => {
        it('returns correct config', () => {
            const result = buildInfiniteApprovalParams(
                '0xToken1234567890abcdef1234567890abcdef12' as Address,
                '0xSpender1234567890abcdef1234567890abcdef' as Address
            )
            expect(result.functionName).toBe('approve')
            expect(result.args[1]).toBe(2n ** 256n - 1n)
        })
    })

    describe('formatTokenAmount', () => {
        it('formats whole number correctly', () => {
            expect(formatTokenAmount(1n * 10n ** 18n, 18)).toBe('1')
        })

        it('formats zero', () => {
            expect(formatTokenAmount(0n, 18)).toBe('0')
        })

        it('strips trailing zeros', () => {
            // 1.5 tokens with 18 decimals
            expect(formatTokenAmount(15n * 10n ** 17n, 18)).toBe('1.5')
        })
    })

    describe('formatDisplayAmount', () => {
        it('truncates to max decimals', () => {
            // 1.123456789 with 18 decimals
            const amount = 1n * 10n ** 18n + 123456789n * 10n ** 9n
            // Should truncate to 6 decimals max
            expect(formatDisplayAmount(amount, 18)).not.toContain('789')
        })

        it('returns whole number when no fraction', () => {
            expect(formatDisplayAmount(1n * 10n ** 18n, 18)).toBe('1')
        })
    })

    describe('formatBalance', () => {
        it('returns "0" for zero', () => {
            expect(formatBalance(0n, 18)).toBe('0')
        })

        it('formats small numbers with 6 decimals max', () => {
            // 0.5 token
            expect(formatBalance(5n * 10n ** 17n, 18)).toBe('0.5')
        })

        it('formats medium numbers with 4 decimals max', () => {
            // 100.1234 tokens
            expect(formatBalance(1001234n * 10n ** 14n, 18)).toBe('100.1234')
        })

        it('formats large numbers with K suffix', () => {
            expect(formatBalance(1500n * 10n ** 18n, 18)).toBe('1.50K')
        })

        it('formats millions with M suffix', () => {
            expect(formatBalance(1500000n * 10n ** 18n, 18)).toBe('1.50M')
        })

        it('formats billions with B suffix', () => {
            expect(formatBalance(1500000000n * 10n ** 18n, 18)).toBe('1.50B')
        })
    })

    describe('parseTokenAmount', () => {
        it('parses "1.5" with 18 decimals', () => {
            expect(parseTokenAmount('1.5', 18)).toBe(15n * 10n ** 17n)
        })
    })

    describe('findWrappedNativeAddress', () => {
        // Wrapped-native now comes from the SDK's getWrappedNativeAddress, while the token
        // list still carries its own copy at index 1. If the two ever disagree, swaps route
        // through the wrong wrapper, so pin them together for every chain we ship.
        it.each(Object.keys(TOKEN_LISTS))('agrees with the token list on chain %s', (chainId) => {
            const listed = TOKEN_LISTS[Number(chainId)]![1]!.address
            expect(findWrappedNativeAddress(Number(chainId))?.toLowerCase()).toBe(
                listed.toLowerCase()
            )
        })

        it('returns undefined for an unsupported chain', () => {
            expect(findWrappedNativeAddress(1)).toBeUndefined()
        })
    })

    describe('getWrappedNativeAddress', () => {
        it('returns the wrapped native for a supported chain', () => {
            expect(getWrappedNativeAddress(96).toLowerCase()).toBe(wrapped.address.toLowerCase())
        })

        it('throws for an unknown chain', () => {
            expect(() => getWrappedNativeAddress(99999)).toThrow()
        })
    })

    describe('getSwapAddress', () => {
        it('returns the wrapped address for a native token', () => {
            expect(getSwapAddress(native.address as Address, 96).toLowerCase()).toBe(
                wrapped.address.toLowerCase()
            )
        })

        // Render-time quote memos can call this with an unsupported chain (e.g. while the
        // input token is still resolving and chainId falls back). It must not throw.
        it('falls back to the native address on an unsupported chain', () => {
            expect(getSwapAddress(native.address as Address, 1)).toBe(native.address)
        })
    })

    describe('isSameToken', () => {
        it('returns false when either token is null', () => {
            expect(isSameToken(stable, null)).toBe(false)
            expect(isSameToken(null, stable)).toBe(false)
            expect(isSameToken(null, null)).toBe(false)
        })

        it('returns false for tokens on different chains', () => {
            expect(isSameToken(stable, { ...stable, chainId: 1 })).toBe(false)
        })

        it('returns true for identical tokens', () => {
            expect(isSameToken(stable, stable)).toBe(true)
        })
    })

    describe('getWrapOperation', () => {
        it('returns "wrap" when input is native', () => {
            expect(getWrapOperation(native, wrapped)).toBe('wrap')
        })

        it('returns "unwrap" when output is native', () => {
            expect(getWrapOperation(wrapped, native)).toBe('unwrap')
        })

        it('returns null when not a native-wrapped pair', () => {
            expect(getWrapOperation(stable, native)).toBe(null)
        })

        it('returns null when either token is null', () => {
            expect(getWrapOperation(null, wrapped)).toBe(null)
        })

        // Regression: an unsupported chain (no wrapped native) must not throw during render.
        it('returns null when the chain has no wrapped native', () => {
            const nativeChain1 = { ...native, chainId: 1 }
            const erc20Chain1 = { ...stable, chainId: 1 }
            expect(getWrapOperation(nativeChain1, erc20Chain1)).toBe(null)
        })
    })
})
