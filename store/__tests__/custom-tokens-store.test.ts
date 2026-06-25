import { describe, it, expect, beforeEach } from 'vitest'
import type { Token } from '@/types/tokens'
import { useCustomTokensStore } from '@/store/custom-tokens-store'

const tokenA: Token = {
    address: '0xAbC0000000000000000000000000000000000001',
    symbol: 'AAA',
    name: 'Token A',
    decimals: 18,
    chainId: 96,
}

describe('custom-tokens-store addCustomToken', () => {
    beforeEach(() => {
        useCustomTokensStore.setState({ customTokens: [] })
    })

    it('adds a new token', () => {
        useCustomTokensStore.getState().addCustomToken(tokenA)
        expect(useCustomTokensStore.getState().customTokens).toHaveLength(1)
    })

    it('dedupes by address case-insensitively on the same chain', () => {
        const { addCustomToken } = useCustomTokensStore.getState()
        addCustomToken(tokenA)
        addCustomToken({ ...tokenA, address: tokenA.address.toLowerCase() as Token['address'] })
        expect(useCustomTokensStore.getState().customTokens).toHaveLength(1)
    })

    it('keeps the same address on a different chain as a distinct entry', () => {
        const { addCustomToken } = useCustomTokensStore.getState()
        addCustomToken(tokenA)
        addCustomToken({ ...tokenA, chainId: 8453 })
        expect(useCustomTokensStore.getState().customTokens).toHaveLength(2)
    })
})
