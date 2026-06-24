import type { Token } from '@/types/tokens'

const STORAGE_KEY = 'junoswap:custom-tokens'

function readAll(): Record<number, Token[]> {
    if (typeof window === 'undefined') return {}
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    } catch {
        return {}
    }
}

function writeAll(data: Record<number, Token[]>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function getCustomTokens(chainId: number): Token[] {
    return readAll()[chainId] ?? []
}

export function saveCustomToken(token: Token): void {
    const all = readAll()
    const existing = all[token.chainId] ?? []
    const deduped = existing.filter((t) => t.address.toLowerCase() !== token.address.toLowerCase())
    all[token.chainId] = [token, ...deduped]
    writeAll(all)
}

export function removeCustomToken(chainId: number, address: string): void {
    const all = readAll()
    all[chainId] = (all[chainId] ?? []).filter(
        (t) => t.address.toLowerCase() !== address.toLowerCase()
    )
    writeAll(all)
}
