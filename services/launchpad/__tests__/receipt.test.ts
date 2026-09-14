import { describe, it, expect } from 'vitest'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import type { Address, Log } from 'viem'
import { BONDING_CURVE_JUNOSWAP_ABI } from '@coshi190/juno-moneta-sdk'
import { findEventArgs } from '@/services/launchpad/receipt'

const CURVE = '0x1111111111111111111111111111111111111111' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address
const CREATOR = '0x3333333333333333333333333333333333333333' as Address
const TOKEN = '0x4444444444444444444444444444444444444444' as Address

function makeLog(address: Address, data: `0x${string}`, topics: `0x${string}`[]): Log {
    return {
        address,
        data,
        topics,
        blockHash: `0x${'0'.repeat(64)}`,
        blockNumber: 1n,
        logIndex: 0,
        transactionHash: `0x${'0'.repeat(64)}`,
        transactionIndex: 0,
        removed: false,
    } as unknown as Log
}

function creationLog(address: Address, tokenAddr: Address): Log {
    const topics = encodeEventTopics({
        abi: BONDING_CURVE_JUNOSWAP_ABI,
        eventName: 'Creation',
        args: { creator: CREATOR },
    })
    const data = encodeAbiParameters(
        [
            { name: 'tokenAddr', type: 'address' },
            { name: 'logo', type: 'string' },
            { name: 'description', type: 'string' },
            { name: 'link1', type: 'string' },
            { name: 'link2', type: 'string' },
            { name: 'link3', type: 'string' },
            { name: 'createdTime', type: 'uint256' },
        ],
        [tokenAddr, 'logo', 'desc', '', '', '', 42n]
    )
    return makeLog(address, data, topics as `0x${string}`[])
}

const CREATION = {
    abi: BONDING_CURVE_JUNOSWAP_ABI,
    eventName: 'Creation',
} as const

describe('findEventArgs', () => {
    it('returns the decoded args of the first matching event', () => {
        const args = findEventArgs<{ tokenAddr: Address; creator: Address }>(
            [creationLog(CURVE, TOKEN)],
            { ...CREATION, address: CURVE }
        )
        expect(args?.tokenAddr).toBe(TOKEN)
        expect(args?.creator).toBe(CREATOR)
    })

    it('skips logs emitted by a different address when one is given', () => {
        const args = findEventArgs<{ tokenAddr: Address }>([creationLog(OTHER, TOKEN)], {
            ...CREATION,
            address: CURVE,
        })
        expect(args).toBeNull()
    })

    it('matches the address case-insensitively', () => {
        const args = findEventArgs<{ tokenAddr: Address }>([creationLog(CURVE, TOKEN)], {
            ...CREATION,
            address: CURVE.toUpperCase().replace('0X', '0x') as Address,
        })
        expect(args?.tokenAddr).toBe(TOKEN)
    })

    it('searches every log when no address is given', () => {
        const args = findEventArgs<{ tokenAddr: Address }>([creationLog(OTHER, TOKEN)], CREATION)
        expect(args?.tokenAddr).toBe(TOKEN)
    })

    it('skips undecodable logs instead of throwing', () => {
        const junk = makeLog(CURVE, '0xdeadbeef', [`0x${'9'.repeat(64)}`])
        const args = findEventArgs<{ tokenAddr: Address }>([junk, creationLog(CURVE, TOKEN)], {
            ...CREATION,
            address: CURVE,
        })
        expect(args?.tokenAddr).toBe(TOKEN)
    })

    it('returns null when no log carries the event', () => {
        expect(findEventArgs([], { ...CREATION, address: CURVE })).toBeNull()
        expect(
            findEventArgs([creationLog(CURVE, TOKEN)], {
                abi: BONDING_CURVE_JUNOSWAP_ABI,
                eventName: 'Swap',
                address: CURVE,
            })
        ).toBeNull()
    })
})
