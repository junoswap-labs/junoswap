import { describe, it, expect } from 'vitest'
import type { Address } from 'viem'
import { classifySwapPair } from '@/lib/swap-chart'
import { bitkub } from '@/lib/wagmi'

const CHAIN = bitkub.id // 96 (kub mainnet)
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address
const KKUB = '0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5' as Address // wrapped native
const KUSDT = '0x7d984C24d2499D840eB3b7016077164e15E5faA6' as Address // stable
const USDT = '0x21cdc3706b8c7b1836df0e533dd884069521350b' as Address // stable
const RANDOM = '0x1111111111111111111111111111111111111111' as Address

describe('classifySwapPair', () => {
    it('native sentinel ↔ stable → native-stable (either order)', () => {
        expect(classifySwapPair(CHAIN, NATIVE, KUSDT).kind).toBe('native-stable')
        expect(classifySwapPair(CHAIN, KUSDT, NATIVE).kind).toBe('native-stable')
    })

    it('wrapped native ↔ stable → native-stable (the KKUB/USDT case)', () => {
        expect(classifySwapPair(CHAIN, KKUB, KUSDT).kind).toBe('native-stable')
    })

    it('native ↔ token → token-native carrying the non-native token', () => {
        const a = classifySwapPair(CHAIN, NATIVE, RANDOM)
        expect(a.kind).toBe('token-native')
        expect(a.tokenAddr).toBe(RANDOM)

        const b = classifySwapPair(CHAIN, RANDOM, KKUB)
        expect(b.kind).toBe('token-native')
        expect(b.tokenAddr).toBe(RANDOM)
    })

    it('no native side → unsupported (token/stable, stable/stable)', () => {
        expect(classifySwapPair(CHAIN, RANDOM, KUSDT).kind).toBe('unsupported')
        expect(classifySwapPair(CHAIN, KUSDT, USDT).kind).toBe('unsupported')
    })

    it('native ↔ wrapped native → unsupported', () => {
        expect(classifySwapPair(CHAIN, NATIVE, KKUB).kind).toBe('unsupported')
    })

    it('missing token or unknown chain → unsupported', () => {
        expect(classifySwapPair(CHAIN, undefined, KUSDT).kind).toBe('unsupported')
        expect(classifySwapPair(999999, NATIVE, KUSDT).kind).toBe('unsupported')
    })
})
