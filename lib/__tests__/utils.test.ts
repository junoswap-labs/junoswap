import { describe, it, expect } from 'vitest'
import { formatAddress, isValidNumberInput } from '@/lib/utils'

describe('formatAddress', () => {
    it('truncates a standard ethereum address', () => {
        const addr = '0x1234567890abcdef1234567890abcdef12345678'
        expect(formatAddress(addr)).toBe('0x1234...5678')
    })

    it('respects custom startChars and endChars', () => {
        const addr = '0x1234567890abcdef1234567890abcdef12345678'
        expect(formatAddress(addr, 8, 6)).toBe('0x123456...345678')
    })

    it('returns original string if length < 10', () => {
        expect(formatAddress('0x1234')).toBe('0x1234')
    })
})

describe('isValidNumberInput', () => {
    it('accepts empty string', () => {
        expect(isValidNumberInput('')).toBe(true)
    })

    it('accepts plain integers', () => {
        expect(isValidNumberInput('123')).toBe(true)
    })

    it('accepts decimals', () => {
        expect(isValidNumberInput('1.5')).toBe(true)
        expect(isValidNumberInput('0.5')).toBe(true)
        expect(isValidNumberInput('.5')).toBe(true)
    })

    it('accepts trailing decimal', () => {
        expect(isValidNumberInput('1.')).toBe(true)
    })

    it('rejects multiple decimal points', () => {
        expect(isValidNumberInput('1.2.3')).toBe(false)
    })

    it('rejects leading zeros followed by digits', () => {
        expect(isValidNumberInput('05')).toBe(false)
        expect(isValidNumberInput('007')).toBe(false)
    })

    it('accepts "0" and "0.5"', () => {
        expect(isValidNumberInput('0')).toBe(true)
        expect(isValidNumberInput('0.5')).toBe(true)
    })

    it('rejects non-numeric characters', () => {
        expect(isValidNumberInput('abc')).toBe(false)
        expect(isValidNumberInput('1e5')).toBe(false)
        expect(isValidNumberInput('1,000')).toBe(false)
    })

    it('accepts just a decimal point', () => {
        expect(isValidNumberInput('.')).toBe(true)
    })
})
