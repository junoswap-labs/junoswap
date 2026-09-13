import { describe, it, expect } from 'vitest'
import { MAX_TICK, MIN_TICK, getFullRange } from '@/lib/tick-math'
import {
    DELTA_BY_PRESET,
    getPresetTickRange,
    getRangePercentages,
    getRangeViewport,
    type RangePreset,
} from '@/lib/range-presets'

const SPACINGS = [1, 10, 50, 60, 200]

describe('DELTA_BY_PRESET', () => {
    it('reproduces the tick deltas the SDK used to hardcode', () => {
        expect(DELTA_BY_PRESET.get('safe')).toBe(4055)
        expect(DELTA_BY_PRESET.get('common')).toBe(1823)
        expect(DELTA_BY_PRESET.get('narrow')).toBe(488)
    })

    it('has no delta for the presets that are not a percentage band', () => {
        expect(DELTA_BY_PRESET.get('full')).toBeUndefined()
        expect(DELTA_BY_PRESET.get('custom')).toBeUndefined()
    })
})

describe('getPresetTickRange', () => {
    it('lands on spacing multiples inside the representable range', () => {
        for (const spacing of SPACINGS) {
            for (const preset of ['full', 'safe', 'common', 'narrow'] as RangePreset[]) {
                const range = getPresetTickRange(preset, 0, spacing)
                expect(Math.abs(range.tickLower % spacing)).toBe(0)
                expect(Math.abs(range.tickUpper % spacing)).toBe(0)
                expect(range.tickLower).toBeGreaterThanOrEqual(MIN_TICK)
                expect(range.tickUpper).toBeLessThanOrEqual(MAX_TICK)
                expect(range.tickUpper).toBeGreaterThan(range.tickLower)
            }
        }
    })

    it('orders the presets by width', () => {
        const width = (preset: RangePreset): number => {
            const r = getPresetTickRange(preset, 0, 60)
            return r.tickUpper - r.tickLower
        }
        expect(width('narrow')).toBeLessThan(width('common'))
        expect(width('common')).toBeLessThan(width('safe'))
        expect(width('safe')).toBeLessThan(width('full'))
    })

    it('centres non-full presets on the current tick', () => {
        const range = getPresetTickRange('common', 6000, 60)
        const mid = (range.tickLower + range.tickUpper) / 2
        expect(Math.abs(mid - 6000)).toBeLessThanOrEqual(60)
    })

    it('collapses custom onto the nearest usable tick', () => {
        const range = getPresetTickRange('custom', 1234, 60)
        expect(range.tickLower).toBe(1260)
        expect(range.tickUpper).toBe(1260)
    })

    it('full matches getFullRange', () => {
        expect(getPresetTickRange('full', 0, 60)).toEqual(getFullRange(60))
    })
})

describe('getRangePercentages', () => {
    it('is zero at the current tick', () => {
        const pct = getRangePercentages(1000, 1000, 1000)
        expect(pct.lowerPercent).toBeCloseTo(0, 9)
        expect(pct.upperPercent).toBeCloseTo(0, 9)
    })

    it('is negative below and positive above', () => {
        const pct = getRangePercentages(0, -1823, 1823)
        expect(pct.lowerPercent).toBeLessThan(0)
        expect(pct.upperPercent).toBeGreaterThan(0)
        expect(pct.upperPercent).toBeCloseTo(20, 0)
    })

    it('agrees with the percentage the preset copy advertises', () => {
        const delta = DELTA_BY_PRESET.get('safe') ?? 0
        const pct = getRangePercentages(0, -delta, delta)
        expect(pct.upperPercent).toBeCloseTo(50, 1)
    })
})

describe('getRangeViewport', () => {
    it('spans the whole tick range for the full preset', () => {
        expect(getRangeViewport(0, 100, 'full')).toEqual({
            tickLower: MIN_TICK,
            tickUpper: MAX_TICK,
        })
    })

    it('brackets the range midpoint and stays in bounds', () => {
        const viewport = getRangeViewport(-600, 600, 'common')
        expect(viewport.tickLower).toBeLessThan(-600)
        expect(viewport.tickUpper).toBeGreaterThan(600)
        expect(viewport.tickLower).toBeGreaterThanOrEqual(MIN_TICK)
        expect(viewport.tickUpper).toBeLessThanOrEqual(MAX_TICK)
    })

    it('clamps at the extremes', () => {
        const viewport = getRangeViewport(MIN_TICK, MIN_TICK + 10, 'narrow')
        expect(viewport.tickLower).toBe(MIN_TICK)
    })
})
