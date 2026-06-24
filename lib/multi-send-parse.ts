import { isAddress, parseUnits, formatUnits } from 'viem'
import type { Address } from 'viem'

export interface ParsedRecipient {
    address: Address
    amount: bigint
    rawAmount: string
}

export interface ParseError {
    line: number
    raw: string
    message: string
}

export interface ParseResult {
    recipients: ParsedRecipient[]
    errors: ParseError[]
}

export interface AddressParseResult {
    addresses: Address[]
    errors: ParseError[]
}

/** Parse addresses-only input. Accepts "address" or "address,amount" lines — amount is ignored. */
export function parseAddressText(text: string): AddressParseResult {
    const addresses: Address[] = []
    const errors: ParseError[] = []
    const seen = new Set<string>()

    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const raw = (lines[i] ?? '').trim()
        if (!raw) continue

        const addr = (raw.split(',')[0] ?? '').trim()

        if (!isAddress(addr, { strict: false })) {
            errors.push({ line: i + 1, raw, message: `Invalid address: ${addr}` })
            continue
        }

        const addrLower = addr.toLowerCase()
        if (seen.has(addrLower)) {
            errors.push({ line: i + 1, raw, message: `Duplicate address` })
            continue
        }
        seen.add(addrLower)
        addresses.push(addr as Address)
    }

    return { addresses, errors }
}

/** Generate random bigint in [min, max] using crypto.getRandomValues for uniform distribution. */
function randomBigIntBetween(min: bigint, max: bigint): bigint {
    const range = max - min + 1n
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    const rand = bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n)
    return min + (rand % range)
}

/**
 * Randomize amounts for a list of addresses within [minStr, maxStr] (human-readable).
 * displayDecimals truncates the result to N decimal places (e.g. 6 → 0.721679).
 * Throws if the effective range after truncation collapses (e.g. min=0.000001, dp=2 → both floor to 0.00).
 */
export function randomizeAmounts(
    addresses: Address[],
    minStr: string,
    maxStr: string,
    decimals: number,
    displayDecimals: number
): ParsedRecipient[] {
    const min = parseUnits(minStr, decimals)
    const max = parseUnits(maxStr, decimals)

    // Truncation factor: each unit = 10^(decimals - displayDecimals)
    const truncFactor = decimals > displayDecimals ? 10n ** BigInt(decimals - displayDecimals) : 1n

    // Ceil min so it stays >= original min after truncation
    const effectiveMin = ((min + truncFactor - 1n) / truncFactor) * truncFactor
    // Floor max
    const effectiveMax = (max / truncFactor) * truncFactor

    if (effectiveMin > effectiveMax) {
        throw new Error(
            `Min (${formatUnits(effectiveMin, decimals)}) exceeds Max (${formatUnits(effectiveMax, decimals)}) at ${displayDecimals} decimal places — increase Decimal Places or widen the range`
        )
    }

    return addresses.map((address) => {
        const raw = randomBigIntBetween(effectiveMin, effectiveMax)
        const amount = (raw / truncFactor) * truncFactor
        return { address, amount, rawAmount: formatUnits(amount, decimals) }
    })
}

export function parseRecipientText(text: string, decimals: number): ParseResult {
    const recipients: ParsedRecipient[] = []
    const errors: ParseError[] = []
    const seen = new Set<string>()

    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const raw = (lines[i] ?? '').trim()
        if (!raw) continue
        const parts = raw.split(',').map((p) => p.trim())

        if (parts.length < 2) {
            errors.push({ line: i + 1, raw, message: 'Missing amount' })
            continue
        }

        const addr = parts[0] ?? ''
        const rawAmount = parts[1] ?? ''

        if (!isAddress(addr, { strict: false })) {
            errors.push({ line: i + 1, raw, message: `Invalid address: ${addr}` })
            continue
        }

        const addrLower = addr.toLowerCase()
        if (seen.has(addrLower)) {
            errors.push({ line: i + 1, raw, message: `Duplicate address` })
            continue
        }
        seen.add(addrLower)

        const sanitized = rawAmount.replace(/[^0-9.]/g, '')
        if (!sanitized || isNaN(Number(sanitized)) || Number(sanitized) <= 0) {
            errors.push({ line: i + 1, raw, message: `Invalid amount: ${rawAmount}` })
            continue
        }

        try {
            const amount = parseUnits(sanitized, decimals)
            recipients.push({ address: addr as Address, amount, rawAmount: sanitized })
        } catch {
            errors.push({ line: i + 1, raw, message: `Amount out of range: ${sanitized}` })
        }
    }

    return { recipients, errors }
}
