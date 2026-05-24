import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatAddress(address: string, startChars = 6, endChars = 4): string {
    if (!address || address.length < 10) return address
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`
}

export function formatTimeAgo(timestampSeconds: number): string {
    const d = Math.floor((Date.now() - timestampSeconds * 1000) / 1000)
    if (d < 60) return `${d}s ago`
    if (d < 3600) return `${Math.floor(d / 60)}m ago`
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`
    if (d < 2592000) return `${Math.floor(d / 86400)}d ago`
    return `${Math.floor(d / 2592000)}mo ago`
}

/**
 * Validates numeric input for token amounts
 * Allows: digits, one decimal point, leading/trailing decimal
 * Blocks: multiple decimals, leading zeros (05), scientific notation (e5)
 */
export function isValidNumberInput(value: string): boolean {
    // Allow empty string
    if (value === '') return true
    // Only allow digits and one decimal point
    if (!/^\d*\.?\d*$/.test(value)) return false
    // Don't allow multiple decimal points
    if ((value.match(/\./g) || []).length > 1) return false
    // Don't allow leading zeros followed by digits (e.g., "05" → "0.5" is ok, but "05" is not)
    if (/^0\d+$/.test(value)) return false
    return true
}
