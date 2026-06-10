import { describe, it, expect, vi } from 'vitest'
import {
    calculateBuyOutput,
    calculateSellOutput,
    calculateGraduationProgress,
    formatKub,
    formatTokenAmount,
    formatCompact,
    isReadyToGraduate,
} from '@/services/launchpad'

vi.mock('@/lib/abis/pump-core-native', () => ({
    PUMP_CORE_NATIVE_ADDRESS: '0xPumpCore',
    PUMP_CORE_NATIVE_ABI: [],
}))

describe('calculateBuyOutput', () => {
    it('returns 0n when nativeAmountIn is 0n', () => {
        expect(calculateBuyOutput(0n, 100n, 1000n, 500n)).toBe(0n)
    })

    it('returns 0n when tokenReserve is 0n', () => {
        expect(calculateBuyOutput(100n, 100n, 0n, 500n)).toBe(0n)
    })

    it('returns 0n for negative nativeAmountIn', () => {
        expect(calculateBuyOutput(-1n, 100n, 1000n, 500n)).toBe(0n)
    })

    it('calculates output with 1% fee applied', () => {
        // nativeAmountIn=10000n, nativeReserve=100000n, tokenReserve=800000n, virtualAmount=200000n
        // feeAmount = 10000 * 100 / 10000 = 100
        // amountAfterFee = 9900
        // inputReserve = 200000 + 100000 = 300000
        // output = getAmountOut(9900, 300000, 800000)
        const result = calculateBuyOutput(10000n, 100000n, 800000n, 200000n)
        expect(result).toBeGreaterThan(0n)
    })
})

describe('calculateSellOutput', () => {
    it('returns 0n when tokenAmountIn is 0n', () => {
        expect(calculateSellOutput(0n, 100n, 1000n, 500n)).toBe(0n)
    })

    it('returns 0n when tokenReserve is 0n', () => {
        expect(calculateSellOutput(100n, 100n, 0n, 500n)).toBe(0n)
    })

    it('returns 0n when nativeReserve is 0n', () => {
        expect(calculateSellOutput(100n, 0n, 1000n, 500n)).toBe(0n)
    })

    it('calculates output with 1% fee applied', () => {
        const result = calculateSellOutput(10000n, 100000n, 800000n, 200000n)
        expect(result).toBeGreaterThan(0n)
    })
})

describe('calculateGraduationProgress', () => {
    it('returns 0 when graduation amount is 0', () => {
        expect(calculateGraduationProgress(100n, 0n)).toBe(0)
    })

    it('calculates percentage correctly', () => {
        expect(calculateGraduationProgress(25n, 100n)).toBe(25)
        expect(calculateGraduationProgress(50n, 100n)).toBe(50)
    })

    it('caps at 100', () => {
        expect(calculateGraduationProgress(200n, 100n)).toBe(100)
    })
})

describe('formatKub', () => {
    it('returns "0" for zero', () => {
        expect(formatKub(0n)).toBe('0')
    })

    it('returns "<0.0001" for very small values', () => {
        expect(formatKub(1n)).toBe('<0.0001')
    })

    it('formats values < 1 with 4 decimals', () => {
        expect(formatKub(5n * 10n ** 17n)).toBe('0.5000')
    })

    it('formats values < 1000 with 2 decimals', () => {
        expect(formatKub(5n * 10n ** 19n)).toBe('50.00')
    })

    it('uses K suffix for thousands', () => {
        expect(formatKub(1500n * 10n ** 18n)).toBe('1.50K')
    })

    it('uses M suffix for millions', () => {
        expect(formatKub(1500000n * 10n ** 18n)).toBe('1.50M')
    })
})

describe('formatTokenAmount', () => {
    it('returns "0" for zero', () => {
        expect(formatTokenAmount(0n)).toBe('0')
    })

    it('uses B suffix for billions', () => {
        expect(formatTokenAmount(1500000000n * 10n ** 18n)).toBe('1.50B')
    })
})

describe('formatCompact', () => {
    it('returns "0" for zero', () => {
        expect(formatCompact(0)).toBe('0')
    })

    it('returns "<0.01" for very small', () => {
        expect(formatCompact(0.001)).toBe('<0.01')
    })

    it('formats values < 1 with 2 decimals', () => {
        expect(formatCompact(0.5)).toBe('0.50')
    })

    it('formats values < 1000 with 0 decimals', () => {
        expect(formatCompact(42)).toBe('42')
    })

    it('uses K suffix', () => {
        expect(formatCompact(1500)).toBe('2K')
    })

    it('uses M suffix', () => {
        expect(formatCompact(1500000)).toBe('2M')
    })

    it('uses B suffix', () => {
        expect(formatCompact(1500000000)).toBe('2B')
    })
})

describe('isReadyToGraduate', () => {
    // Mirrors PumpCoreNative.graduate's check:
    //   floor(token/native) <= floor(INITIALTOKEN / graduationAmount)
    // Cross-multiplied (no float) as:
    //   token * graduationAmount <= INITIAL_TOKEN * native
    // INITIALTOKEN is constant: 1B tokens × 1e18.
    const INITIAL_TOKEN = 1_000_000_000n * 10n ** 18n
    const ONE_ETHER = 10n ** 18n
    const CAP_150 = 150n * ONE_ETHER
    const CAP_200 = 200n * ONE_ETHER

    it('returns false when isGraduated is true', () => {
        // Even at reserves that would otherwise qualify, a graduated token is not "ready".
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN, CAP_150, true)).toBe(false)
    })

    it('returns false when graduationAmount is 0n', () => {
        // Defensive: contract would panic (division by zero) in this state.
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN, 0n, false)).toBe(false)
    })

    it('returns false when nativeReserve is 0 and tokenReserve is positive', () => {
        // Contract would panic (division by zero) — UI must say "not ready".
        expect(isReadyToGraduate(0n, INITIAL_TOKEN, CAP_150, false)).toBe(false)
    })

    it('returns true at the equilibrium point (nativeReserve == cap, tokenReserve == INITIAL_TOKEN)', () => {
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN, CAP_150, false)).toBe(true)
    })

    it('returns false one wei below the cap on nativeReserve', () => {
        // UI is stricter than the contract at this boundary (the contract's floored
        // division would still allow, but we want the button disabled — better to
        // make the user buy one more wei than to revert).
        expect(isReadyToGraduate(CAP_150 - 1n, INITIAL_TOKEN, CAP_150, false)).toBe(false)
    })

    it('matches the contract for a non-150 cap (regression for the hardcoded-cap bug)', () => {
        // With a 200-ether cap and 200 KUB in reserves, the token is ready.
        expect(isReadyToGraduate(CAP_200, INITIAL_TOKEN, CAP_200, false)).toBe(true)

        // With a 200-ether cap and only 150 KUB in reserves, the token is NOT ready
        // (150/200 < 1, so the ratio token/native = 1B/150 is above 1B/200).
        // The old hardcoded cap of 150 ether would have said TRUE here — that was
        // the bug. This assertion would have failed pre-fix.
        expect(isReadyToGraduate(CAP_150, INITIAL_TOKEN, CAP_200, false)).toBe(false)
    })

    it('returns false when the contract would revert with "not reach graduation cap"', () => {
        // token/native = 1B/100 = 10M, threshold = floor(1B/150) = 6_666_666.
        // 10M > 6_666_666 → contract reverts. UI must agree.
        expect(isReadyToGraduate(100n * ONE_ETHER, INITIAL_TOKEN, CAP_150, false)).toBe(false)
    })

    it('returns true for the stuck-token scenario (past cap, contract sqrt-bug blocks init)', () => {
        // Real on-chain values from a token stuck at graduation because of the
        // Math.sqrt integer-division bug in PumpCoreNative.initialize. The ratio
        // check passes (the rescue flow in useGraduate handles the init bug).
        // 4010 KUB / 461M tokens with 150-ether cap.
        const nativeReserve = 4009_500000000000000000n // 4009.5 KUB
        const tokenReserve = 461_366_962461691276297068760n // ~461M tokens
        expect(isReadyToGraduate(nativeReserve, tokenReserve, CAP_150, false)).toBe(true)
    })
})
