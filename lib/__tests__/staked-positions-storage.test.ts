import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('staked-positions-storage', () => {
    let store: Record<string, string>

    beforeEach(() => {
        store = {}
        const mockStorage = {
            getItem: (key: string) => store[key] ?? null,
            setItem: (key: string, value: string) => {
                store[key] = value
            },
            removeItem: (key: string) => {
                delete store[key]
            },
            clear: () => {
                store = {}
            },
            get length() {
                return Object.keys(store).length
            },
            key: (_index: number) => null,
        }
        vi.stubGlobal('localStorage', mockStorage)
        vi.stubGlobal('window', { localStorage: mockStorage })
        vi.resetModules()
    })

    async function getModule() {
        return await import('@/lib/staked-positions-storage')
    }

    describe('getStakedTokenIds', () => {
        it('returns empty array when no data in localStorage', async () => {
            const { getStakedTokenIds } = await getModule()
            expect(getStakedTokenIds(96, '0xabc')).toEqual([])
        })

        it('returns stored bigint array', async () => {
            const { addStakedTokenId, getStakedTokenIds } = await getModule()
            addStakedTokenId(96, '0xAbC', 1n)
            addStakedTokenId(96, '0xAbC', 2n)
            expect(getStakedTokenIds(96, '0xabc')).toEqual([1n, 2n])
        })
    })

    describe('addStakedTokenId', () => {
        it('adds a new tokenId to empty storage', async () => {
            const { addStakedTokenId, getStakedTokenIds } = await getModule()
            addStakedTokenId(96, '0xUser', 42n)
            expect(getStakedTokenIds(96, '0xuser')).toEqual([42n])
        })

        it('does not add duplicates', async () => {
            const { addStakedTokenId, getStakedTokenIds } = await getModule()
            addStakedTokenId(96, '0xUser', 42n)
            addStakedTokenId(96, '0xUser', 42n)
            expect(getStakedTokenIds(96, '0xuser')).toEqual([42n])
        })

        it('appends to existing list', async () => {
            const { addStakedTokenId, getStakedTokenIds } = await getModule()
            addStakedTokenId(96, '0xUser', 1n)
            addStakedTokenId(96, '0xUser', 2n)
            expect(getStakedTokenIds(96, '0xuser')).toEqual([1n, 2n])
        })
    })

    describe('removeStakedTokenId', () => {
        it('removes specified tokenId', async () => {
            const { addStakedTokenId, removeStakedTokenId, getStakedTokenIds } = await getModule()
            addStakedTokenId(96, '0xUser', 1n)
            addStakedTokenId(96, '0xUser', 2n)
            removeStakedTokenId(96, '0xUser', 1n)
            expect(getStakedTokenIds(96, '0xuser')).toEqual([2n])
        })

        it('cleans up empty address entries', async () => {
            const { addStakedTokenId, removeStakedTokenId, hasStoredTokenIds } = await getModule()
            addStakedTokenId(96, '0xUser', 1n)
            removeStakedTokenId(96, '0xUser', 1n)
            expect(hasStoredTokenIds(96, '0xuser')).toBe(false)
        })

        it('is a no-op for non-existent tokenId', async () => {
            const { addStakedTokenId, removeStakedTokenId, getStakedTokenIds } = await getModule()
            addStakedTokenId(96, '0xUser', 1n)
            removeStakedTokenId(96, '0xUser', 99n)
            expect(getStakedTokenIds(96, '0xuser')).toEqual([1n])
        })
    })

    describe('setStakedTokenIds', () => {
        it('overwrites entire list', async () => {
            const { addStakedTokenId, setStakedTokenIds, getStakedTokenIds } = await getModule()
            addStakedTokenId(96, '0xUser', 1n)
            setStakedTokenIds(96, '0xUser', [10n, 20n, 30n])
            expect(getStakedTokenIds(96, '0xuser')).toEqual([10n, 20n, 30n])
        })
    })

    describe('hasStoredTokenIds', () => {
        it('returns false when no data', async () => {
            const { hasStoredTokenIds } = await getModule()
            expect(hasStoredTokenIds(96, '0xUser')).toBe(false)
        })

        it('returns true when data exists', async () => {
            const { addStakedTokenId, hasStoredTokenIds } = await getModule()
            addStakedTokenId(96, '0xUser', 1n)
            expect(hasStoredTokenIds(96, '0xuser')).toBe(true)
        })
    })
})
