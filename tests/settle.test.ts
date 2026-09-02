import { describe, it, expect } from 'vitest'
import { netBalances, minTransfers, debtCount } from '../lib/settle'
import { sum } from '../lib/money'
import type { Expense, Settlement } from '../lib/types'

const exp = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1', groupId: 'g1', payerId: 'a', description: 'x', category: 'other',
  occurredAt: '2026-08-29T00:00:00.000Z', currency: 'INR',
  participants: ['a', 'b', 'c'], splitMode: 'equal', totalMinor: 900,
  taxMinor: 0, tipMinor: 0, extrasPolicy: 'proportional', fxRate: 1, baseTotalMinor: 0,
  rationale: [], createdBy: 'human', createdAt: '2026-08-29T00:00:00.000Z',
  ...over,
})

describe('netBalances', () => {
  it('credits the payer and debits everyone', () => {
    expect(netBalances([exp()])).toEqual({ a: 600, b: -300, c: -300 })
  })
  it('always sums to zero', () => {
    const es = [exp({ id: '1' }), exp({ id: '2', payerId: 'b', totalMinor: 777 })]
    expect(sum(Object.values(netBalances(es)))).toBe(0)
  })
  it('folds in recorded payments', () => {
    const s: Settlement[] = [{ id: 's', groupId: 'g1', from: 'b', to: 'a', amountMinor: 300, settledAt: '' }]
    expect(netBalances([exp()], s)).toEqual({ a: 300, b: 0, c: -300 })
  })
})

describe('minTransfers', () => {
  it('is empty when everyone is square', () => {
    expect(minTransfers({ a: 0, b: 0 })).toEqual([])
  })
  it('settles a two-party debt directly', () => {
    expect(minTransfers({ a: 500, b: -500 })).toEqual([{ from: 'b', to: 'a', amountMinor: 500 }])
  })
  it('never emits more than n-1 transfers', () => {
    expect(minTransfers({ a: 3333, b: -1111, c: -1111, d: -1111 }).length).toBeLessThanOrEqual(3)
  })
  it('never emits a zero or self transfer', () => {
    const t = minTransfers({ a: 100, b: -100, c: 0 })
    expect(t.every((x) => x.amountMinor > 0 && x.from !== x.to)).toBe(true)
  })
  it('does not mutate its input', () => {
    const b = { a: 500, b: -500 }
    minTransfers(b)
    expect(b).toEqual({ a: 500, b: -500 })
  })
  it('settles 200 random groups to exactly zero', () => {
    for (let n = 0; n < 200; n++) {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 2 + Math.floor(Math.random() * 5))
      const bal: Record<string, number> = {}
      let running = 0
      ids.slice(0, -1).forEach((id) => {
        const v = Math.floor(Math.random() * 200000) - 100000
        bal[id] = v; running += v
      })
      bal[ids[ids.length - 1]] = -running
      const after = { ...bal }
      for (const t of minTransfers(bal)) {
        after[t.from] += t.amountMinor
        after[t.to] -= t.amountMinor
      }
      for (const v of Object.values(after)) expect(v).toBe(0)
    }
  })
})

describe('debtCount', () => {
  it('counts non-payer participants per expense', () => {
    expect(debtCount([exp(), exp({ participants: ['a', 'b'] })])).toBe(3)
  })
})

describe('multi-currency', () => {
  const foreign = (over: Partial<Expense> = {}): Expense =>
    exp({ currency: 'THB', fxRate: 2.4, ...over })

  it('credits and debits in the group currency, not the expense currency', () => {
    // 900 baht at 2.4 = 2160 rupees, split three ways.
    const b = netBalances([foreign({ totalMinor: 900 })])
    expect(b).toEqual({ a: 1440, b: -720, c: -720 })
  })

  it('still nets to zero across mixed currencies', () => {
    const es = [
      exp({ id: '1', totalMinor: 1000 }),
      foreign({ id: '2', payerId: 'b', totalMinor: 777 }),
      exp({ id: '3', payerId: 'c', currency: 'USD', fxRate: 83.5, totalMinor: 41 }),
    ]
    expect(sum(Object.values(netBalances(es)))).toBe(0)
  })

  it('conserves exactly across 200 random rates', () => {
    for (let n = 0; n < 200; n++) {
      const es = Array.from({ length: 1 + Math.floor(Math.random() * 5) }, (_, i) =>
        exp({
          id: `e${i}`,
          payerId: ['a', 'b', 'c'][Math.floor(Math.random() * 3)],
          currency: 'XXX',
          fxRate: Math.random() * 100,
          totalMinor: Math.floor(Math.random() * 500000),
        }))
      expect(sum(Object.values(netBalances(es)))).toBe(0)
    }
  })
})
