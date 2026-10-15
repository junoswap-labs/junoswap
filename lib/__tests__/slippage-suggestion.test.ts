import { describe, it, expect } from 'vitest'
import { isSlippageRevert, suggestSlippage } from '@/lib/slippage-suggestion'

describe('isSlippageRevert', () => {
    it('matches the curve min-output revert', () => {
        expect(
            isSlippageRevert({
                shortMessage:
                    'The contract function "buy" reverted with the following reason:\ninsufficient output amount',
            })
        ).toBe(true)
    })

    it('ignores unrelated reverts and null', () => {
        expect(isSlippageRevert({ message: 'User rejected the request' })).toBe(false)
        expect(isSlippageRevert(null)).toBe(false)
    })
})

describe('suggestSlippage', () => {
    it('floors at 2% and steps up from higher values', () => {
        expect(suggestSlippage(0.5)).toBe(2)
        expect(suggestSlippage(3)).toBe(4.5)
    })

    it('caps at 49%', () => {
        expect(suggestSlippage(60)).toBe(49)
    })
})
