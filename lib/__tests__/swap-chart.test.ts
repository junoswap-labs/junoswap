import { describe, it, expect } from 'vitest'
import type { Address } from 'viem'
import { classifySwapPair } from '@/lib/swap-chart'
import { bitkub } from '@/lib/wagmi'

const CHAIN = bitkub.id // 96 (kub mainnet)
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address
const KKUB = '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5' as Address // wrapped native
const KUSDT = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as Address // stable
const USDT = '0x21cdc3706b8c7b1836df0e533dd884069521350b' as Address // stable
const CMM = '0x9b005000a10ac871947d99001345b01c1cef2790' as Address // non-stable token
const PEPE = '0x05f208a4990ded1158beb8c0526b7b1cfceb1c78' as Address // non-stable token

describe('classifySwapPair', () => {
    it('native ↔ stable → native-stable (base native, quote stable)', () => {
        const r = classifySwapPair(CHAIN, NATIVE, KUSDT)
        expect(r.kind).toBe('native-stable')
        expect(r.baseAddr).toBe(NATIVE)
        expect(r.quoteAddr).toBe(KUSDT)
        // wrapped native counts as native; order-independent
        expect(classifySwapPair(CHAIN, KKUB, KUSDT).kind).toBe('native-stable')
        expect(classifySwapPair(CHAIN, KUSDT, NATIVE).kind).toBe('native-stable')
    })

    it('native ↔ token → token-native (base token, quote native)', () => {
        const r = classifySwapPair(CHAIN, NATIVE, CMM)
        expect(r.kind).toBe('token-native')
        expect(r.baseAddr).toBe(CMM)
        expect(r.quoteAddr).toBe(NATIVE)
        const r2 = classifySwapPair(CHAIN, CMM, KKUB)
        expect(r2.kind).toBe('token-native')
        expect(r2.baseAddr).toBe(CMM)
        expect(r2.quoteAddr).toBe(KKUB)
    })

    it('token ↔ stable → token-stable (base token, quote stable)', () => {
        const r = classifySwapPair(CHAIN, CMM, KUSDT)
        expect(r.kind).toBe('token-stable')
        expect(r.baseAddr).toBe(CMM)
        expect(r.quoteAddr).toBe(KUSDT)
        // order-independent (stable first)
        const r2 = classifySwapPair(CHAIN, USDT, CMM)
        expect(r2.kind).toBe('token-stable')
        expect(r2.baseAddr).toBe(CMM)
        expect(r2.quoteAddr).toBe(USDT)
    })

    it('token ↔ token → token-token (base = tokenIn, quote = tokenOut)', () => {
        const r = classifySwapPair(CHAIN, CMM, PEPE)
        expect(r.kind).toBe('token-token')
        expect(r.baseAddr).toBe(CMM)
        expect(r.quoteAddr).toBe(PEPE)
    })

    it('unsupported: native↔native, stable↔stable, missing token, unknown chain', () => {
        expect(classifySwapPair(CHAIN, NATIVE, KKUB).kind).toBe('unsupported')
        expect(classifySwapPair(CHAIN, KUSDT, USDT).kind).toBe('unsupported')
        expect(classifySwapPair(CHAIN, undefined, KUSDT).kind).toBe('unsupported')
        expect(classifySwapPair(999999, NATIVE, KUSDT).kind).toBe('unsupported')
    })
})
