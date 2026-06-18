import { describe, it, expect, vi, beforeEach } from 'vitest'

const ponderRequest = vi.fn()
vi.mock('@/lib/ponder-client', () => ({
    ponderRequest: (q: string) => ponderRequest(q),
    isPonderError: () => false,
}))

import { computePoints, fetchV2SwapEvents } from '@/lib/leaderboard-utils'
import { INTERMEDIARY_TOKENS } from '@/lib/routing-config'
import { bitkub } from '@/lib/wagmi'

const WN = INTERMEDIARY_TOKENS[bitkub.id]!.wrappedNative.toLowerCase()
const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const ONE = '1000000000000000000'
const TWO = '2000000000000000000'

describe('computePoints', () => {
    it('scores junoswap volume at 1 point per 50 native', () => {
        expect(computePoints(100, 0)).toBe(2)
    })

    it('discounts external volume 10x (1 point per 500 native)', () => {
        // The same 1000 native earns 20 points on junoswap but only 2 externally.
        expect(computePoints(1000, 0)).toBe(20)
        expect(computePoints(0, 1000)).toBe(2)
    })

    it('sums both sources before flooring', () => {
        // 25/50 + 250/500 = 0.5 + 0.5 = 1, though each source alone floors to 0.
        expect(computePoints(25, 250)).toBe(1)
        expect(computePoints(50, 500)).toBe(2)
    })
})

describe('fetchV2SwapEvents', () => {
    beforeEach(() => ponderRequest.mockReset())

    it('measures volume on the native leg and maps buy/sell semantics', async () => {
        ponderRequest.mockResolvedValue({
            v2SwapEvents: {
                items: [
                    // Buy: native (token0) flows in, token flows out.
                    {
                        txFrom: '0xTrader1',
                        token0Addr: WN,
                        token1Addr: TOKEN,
                        amount0In: ONE,
                        amount1In: '0',
                        amount0Out: '0',
                        amount1Out: '5',
                        timestamp: 100,
                        protocol: 'jibswap',
                    },
                    // Sell: token (token0) flows in, native (token1) flows out.
                    {
                        txFrom: '0xTrader2',
                        token0Addr: TOKEN,
                        token1Addr: WN,
                        amount0In: '7',
                        amount1In: '0',
                        amount0Out: '0',
                        amount1Out: TWO,
                        timestamp: 200,
                        protocol: 'udonswap',
                    },
                ],
            },
        })

        const rows = await fetchV2SwapEvents(bitkub.id, 0)
        expect(rows).toEqual([
            {
                tokenAddr: TOKEN,
                sender: '0xTrader1',
                isBuy: 1,
                amountIn: ONE, // native paid
                amountOut: '5', // tokens received
                timestamp: 100,
                protocol: 'jibswap',
            },
            {
                tokenAddr: TOKEN,
                sender: '0xTrader2',
                isBuy: 0,
                amountIn: '7', // tokens sold
                amountOut: TWO, // native received
                timestamp: 200,
                protocol: 'udonswap',
            },
        ])
    })

    it('skips token/token pairs with no native leg', async () => {
        ponderRequest.mockResolvedValue({
            v2SwapEvents: {
                items: [
                    {
                        txFrom: '0xTrader3',
                        token0Addr: TOKEN,
                        token1Addr: TOKEN_B,
                        amount0In: ONE,
                        amount1In: '0',
                        amount0Out: '0',
                        amount1Out: '9',
                        timestamp: 300,
                        protocol: 'diamon',
                    },
                ],
            },
        })

        expect(await fetchV2SwapEvents(bitkub.id, 0)).toEqual([])
    })
})
