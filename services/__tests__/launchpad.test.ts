import { describe, it, expect, vi } from 'vitest'
import {
    calculateBuyOutput,
    calculateSellOutput,
    calculateMarketCap,
    calculateGraduationProgress,
    formatKub,
    formatTokenAmount,
    formatCompact,
    getCreateTokenConfig,
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

describe('calculateMarketCap', () => {
    it('returns "0" when circulating supply is zero', () => {
        const totalSupply = 1000n
        expect(calculateMarketCap(500n, totalSupply, totalSupply)).toBe('0')
    })

    it('calculates market cap correctly', () => {
        const totalSupply = 1000000000n * 10n ** 18n
        const tokenReserve = 800000000n * 10n ** 18n
        const nativeReserve = 100n * 10n ** 18n
        const result = calculateMarketCap(nativeReserve, tokenReserve, totalSupply)
        expect(parseFloat(result)).toBeGreaterThan(0)
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

describe('getCreateTokenConfig', () => {
    it('returns correct config shape', () => {
        const form = {
            name: 'Test',
            symbol: 'TST',
            logo: 'https://logo.png',
            description: 'Test token',
            link1: '',
            link2: '',
            link3: '',
            createFee: 100n,
        }
        const config = getCreateTokenConfig(form)
        expect(config.functionName).toBe('createToken')
        expect(config.args).toEqual(['Test', 'TST', 'https://logo.png', 'Test token', '', '', ''])
        expect(config.value).toBe(100n)
    })
})
