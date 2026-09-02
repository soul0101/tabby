import { describe, it, expect } from 'vitest'
import { toMinor, fromMinor, formatMinor, allocate, sum } from '../lib/money'

describe('toMinor', () => {
  it('converts rupees to paise without float drift', () => {
    expect(toMinor(0.1 + 0.2)).toBe(30)
    expect(toMinor(1234.56)).toBe(123456)
    expect(toMinor(19.99)).toBe(1999)
  })
  it('round-trips', () => {
    expect(fromMinor(toMinor(845.5))).toBe(845.5)
  })
})

describe('allocate', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(allocate(300, [1, 1, 1])).toEqual([100, 100, 100])
  })
  it('never loses or invents a paisa on an indivisible total', () => {
    const r = allocate(100, [1, 1, 1])
    expect(sum(r)).toBe(100)
    expect(r).toEqual([34, 33, 33])
  })
  it('allocates proportionally to weights', () => {
    expect(allocate(1000, [3, 1])).toEqual([750, 250])
  })
  it('gives remainders to the largest fractional parts, spread by at most one unit', () => {
    const r = allocate(1000, [1, 1, 1, 1, 1, 1, 1])
    expect(sum(r)).toBe(1000)
    expect(Math.max(...r) - Math.min(...r)).toBe(1)
  })
  it('handles zero weights without dividing by zero', () => {
    expect(allocate(100, [1, 0])).toEqual([100, 0])
  })
  it('returns all zeros for a zero total', () => {
    expect(allocate(0, [1, 2, 3])).toEqual([0, 0, 0])
  })
  it('returns all zeros when every weight is zero', () => {
    expect(allocate(500, [0, 0])).toEqual([0, 0])
  })
  it('handles a negative total (refunds) while conserving exactly', () => {
    const r = allocate(-100, [1, 1, 1])
    expect(sum(r)).toBe(-100)
  })
  it('is deterministic across repeated calls', () => {
    const a = allocate(1000, [1, 1, 1])
    const b = allocate(1000, [1, 1, 1])
    expect(a).toEqual(b)
  })
  it('conserves exactly across 500 random cases', () => {
    for (let n = 0; n < 500; n++) {
      const total = Math.floor(Math.random() * 1_000_00)
      const weights = Array.from({ length: 2 + Math.floor(Math.random() * 8) },
        () => Math.floor(Math.random() * 1000))
      expect(sum(allocate(total, weights))).toBe(weights.some(w => w > 0) ? total : 0)
    }
  })
})

describe('formatMinor', () => {
  it('formats INR at the render edge only', () => {
    expect(formatMinor(123456)).toBe('₹1,234.56')
    expect(formatMinor(0)).toBe('₹0.00')
  })
})

describe('foreign currencies', () => {
  it('uses the narrow symbol rather than the code', () => {
    expect(formatMinor(36000, 'THB')).toContain('฿')
    expect(formatMinor(36000, 'THB')).not.toContain('THB')
    expect(formatMinor(1999, 'USD')).toContain('$')
  })
  it('still formats the home currency correctly', () => {
    expect(formatMinor(123456)).toBe('₹1,234.56')
  })
})
