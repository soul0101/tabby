import { describe, it, expect } from 'vitest'
import { computeShares, totalOf, consumersOf, netFor, itemsDecided } from '../lib/split'
import { sum } from '../lib/money'
import type { Expense } from '../lib/types'

const base = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1', groupId: 'g1', payerId: 'a', description: 'Dinner', category: 'food',
  occurredAt: '2026-08-29T20:00:00.000Z', currency: 'INR',
  participants: ['a', 'b', 'c'], splitMode: 'equal', totalMinor: 0,
  taxMinor: 0, tipMinor: 0, extrasPolicy: 'proportional', fxRate: 1, baseTotalMinor: 0,
  rationale: [], createdBy: 'human', createdAt: '2026-08-29T20:00:00.000Z',
  ...over,
})

describe('equal', () => {
  it('divides evenly', () => {
    expect(computeShares(base({ totalMinor: 300 }))).toEqual({ a: 100, b: 100, c: 100 })
  })
  it('loses no paisa on an indivisible total', () => {
    const s = computeShares(base({ totalMinor: 100 }))
    expect(sum(Object.values(s))).toBe(100)
    expect(Math.max(...Object.values(s)) - Math.min(...Object.values(s))).toBe(1)
  })
  it('handles a single participant', () => {
    expect(computeShares(base({ participants: ['a'], totalMinor: 999 }))).toEqual({ a: 999 })
  })
  it('returns nothing when there are no participants', () => {
    expect(computeShares(base({ participants: [], totalMinor: 500 }))).toEqual({})
  })
})

describe('shares', () => {
  it('weights each person', () => {
    const e = base({ splitMode: 'shares', totalMinor: 4000, weights: { a: 2, b: 1, c: 1 } })
    expect(computeShares(e)).toEqual({ a: 2000, b: 1000, c: 1000 })
  })
  it('treats a missing weight as one', () => {
    const e = base({ splitMode: 'shares', totalMinor: 300, weights: { a: 1 } })
    expect(computeShares(e)).toEqual({ a: 100, b: 100, c: 100 })
  })
  it('falls back to an even split when every weight is zero', () => {
    const e = base({ splitMode: 'shares', totalMinor: 300, weights: { a: 0, b: 0, c: 0 } })
    expect(sum(Object.values(computeShares(e)))).toBe(300)
  })
  it('excludes someone given a weight of zero alongside others', () => {
    const e = base({ splitMode: 'shares', totalMinor: 300, weights: { a: 0, b: 1, c: 1 } })
    expect(computeShares(e)).toEqual({ a: 0, b: 150, c: 150 })
  })
})

describe('exact', () => {
  it('uses the amounts entered', () => {
    const e = base({ splitMode: 'exact', totalMinor: 1000, exact: { a: 500, b: 300, c: 200 } })
    expect(computeShares(e)).toEqual({ a: 500, b: 300, c: 200 })
  })
  it('absorbs a shortfall on the largest share so the bill still reconciles', () => {
    const e = base({ splitMode: 'exact', totalMinor: 1000, exact: { a: 500, b: 300, c: 190 } })
    const s = computeShares(e)
    expect(sum(Object.values(s))).toBe(1000)
    expect(s.a).toBe(510)
  })
  it('treats a missing entry as zero', () => {
    const e = base({ splitMode: 'exact', totalMinor: 800, exact: { a: 800 } })
    expect(computeShares(e)).toEqual({ a: 800, b: 0, c: 0 })
  })
})

describe('items', () => {
  const items = (over: Partial<Expense> = {}) => base({ splitMode: 'items', ...over })

  it('splits an unassigned item across everyone', () => {
    const e = items({ items: [{ id: 'i1', label: 'Pizza', amountMinor: 900, eatenBy: [] }] })
    expect(computeShares(e)).toEqual({ a: 300, b: 300, c: 300 })
  })
  it('charges an assigned item only to whoever had it', () => {
    const e = items({ items: [{ id: 'i1', label: 'Rum', amountMinor: 600, eatenBy: ['b'] }] })
    expect(computeShares(e)).toEqual({ a: 0, b: 600, c: 0 })
  })
  it('ignores an assignment to someone not on the expense', () => {
    const e = items({
      participants: ['a', 'b'],
      items: [{ id: 'i1', label: 'Pizza', amountMinor: 900, eatenBy: ['c'] }],
    })
    expect(computeShares(e)).toEqual({ a: 450, b: 450 })
  })
  it('spreads extras by what each person had', () => {
    const e = items({
      participants: ['a', 'b'],
      items: [
        { id: 'i1', label: 'Prawns', amountMinor: 3000, eatenBy: ['a'] },
        { id: 'i2', label: 'Dal', amountMinor: 1000, eatenBy: ['b'] },
      ],
      tipMinor: 400,
    })
    expect(computeShares(e)).toEqual({ a: 3300, b: 1100 })
  })
  it('spreads extras evenly when asked', () => {
    const e = items({
      participants: ['a', 'b'],
      extrasPolicy: 'equal',
      items: [
        { id: 'i1', label: 'Prawns', amountMinor: 3000, eatenBy: ['a'] },
        { id: 'i2', label: 'Dal', amountMinor: 1000, eatenBy: ['b'] },
      ],
      tipMinor: 400,
    })
    expect(computeShares(e)).toEqual({ a: 3200, b: 1200 })
  })
  it('handles extras with nothing itemised yet', () => {
    const e = items({ participants: ['a', 'b'], taxMinor: 100 })
    expect(computeShares(e)).toEqual({ a: 50, b: 50 })
  })
  it('always reconciles to the total across 300 random bills', () => {
    for (let n = 0; n < 300; n++) {
      const people = ['a', 'b', 'c', 'd'].slice(0, 2 + Math.floor(Math.random() * 3))
      const e = items({
        participants: people,
        extrasPolicy: Math.random() > 0.5 ? 'proportional' : 'equal',
        taxMinor: Math.floor(Math.random() * 5000),
        tipMinor: Math.floor(Math.random() * 5000),
        items: Array.from({ length: 1 + Math.floor(Math.random() * 12) }, (_, i) => ({
          id: `i${i}`, label: `x${i}`,
          amountMinor: Math.floor(Math.random() * 300000),
          eatenBy: people.filter(() => Math.random() > 0.5),
        })),
      })
      expect(sum(Object.values(computeShares(e)))).toBe(totalOf(e))
    }
  })
})

describe('helpers', () => {
  it('consumersOf falls back to everyone', () => {
    const e = base({ participants: ['a', 'b'] })
    expect(consumersOf({ id: 'i', label: 'x', amountMinor: 1, eatenBy: [] }, e)).toEqual(['a', 'b'])
  })
  it('netFor credits the payer and debits everyone', () => {
    const e = base({ totalMinor: 300 })
    expect(netFor(e, 'a')).toBe(200)
    expect(netFor(e, 'b')).toBe(-100)
  })
  it('itemsDecided counts assigned lines', () => {
    const e = base({
      splitMode: 'items',
      items: [
        { id: 'i1', label: 'a', amountMinor: 1, eatenBy: ['a'] },
        { id: 'i2', label: 'b', amountMinor: 1, eatenBy: [] },
      ],
    })
    expect(itemsDecided(e)).toEqual({ decided: 1, total: 2 })
  })
})
