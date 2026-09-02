import { allocate, sum } from './money'
import type { Expense, Id, LineItem } from './types'

/** The bill's total, whichever way it was entered. */
export function totalOf(e: Expense): number {
  if (e.splitMode === 'items') {
    return sum((e.items ?? []).map((i) => i.amountMinor)) + e.taxMinor + e.tipMinor
  }
  return e.totalMinor
}

/** Who had a given item. An unassigned item belongs to everyone present. */
export function consumersOf(item: LineItem, e: Expense): Id[] {
  const explicit = item.eatenBy.filter((m) => e.participants.includes(m))
  return explicit.length > 0 ? explicit : e.participants
}

const weightOf = (e: Expense, id: Id) => Math.max(0, e.weights?.[id] ?? 1)

/**
 * The single place a person's share of an expense is decided.
 *
 * Guaranteed to sum to exactly `totalOf(e)` — no paisa is lost or invented,
 * whichever split mode is used.
 */
export function computeShares(e: Expense): Record<Id, number> {
  const shares: Record<Id, number> = {}
  for (const id of e.participants) shares[id] = 0
  if (e.participants.length === 0) return shares

  if (e.splitMode === 'exact') {
    // Trust the entered amounts, but absorb any rounding gap on the largest
    // share so the expense still reconciles exactly.
    let running = 0
    for (const id of e.participants) {
      shares[id] = Math.round(e.exact?.[id] ?? 0)
      running += shares[id]
    }
    const gap = e.totalMinor - running
    if (gap !== 0) {
      const biggest = e.participants.reduce((a, b) => (shares[b] > shares[a] ? b : a), e.participants[0])
      shares[biggest] += gap
    }
    return shares
  }

  if (e.splitMode === 'items') {
    for (const item of e.items ?? []) {
      const consumers = consumersOf(item, e)
      const parts = allocate(item.amountMinor, consumers.map(() => 1))
      consumers.forEach((id, i) => { shares[id] += parts[i] })
    }
    const extras = e.taxMinor + e.tipMinor
    if (extras !== 0) {
      const subtotals = e.participants.map((id) => shares[id])
      const useSubtotals = e.extrasPolicy === 'proportional' && subtotals.some((s) => s > 0)
      const parts = allocate(extras, useSubtotals ? subtotals : e.participants.map(() => 1))
      e.participants.forEach((id, i) => { shares[id] += parts[i] })
    }
    return shares
  }

  // equal and shares differ only in the weights.
  const weights = e.splitMode === 'shares'
    ? e.participants.map((id) => weightOf(e, id))
    : e.participants.map(() => 1)
  const parts = allocate(e.totalMinor, weights.some((w) => w > 0) ? weights : e.participants.map(() => 1))
  e.participants.forEach((id, i) => { shares[id] = parts[i] })
  return shares
}

/**
 * Each person's share expressed in the *group's* currency.
 *
 * Converting each share individually and summing would drift off the stored
 * base total, so instead the base total is allocated in proportion to the
 * shares. That keeps the guarantee that a group's balances sum to zero even
 * when its expenses were paid in four different currencies.
 */
export function computeBaseShares(e: Expense): Record<Id, number> {
  const shares = computeShares(e)
  if (e.currency === undefined || e.fxRate === 1) return shares

  const ids = e.participants
  const parts = allocate(baseTotalOf(e), ids.map((id) => shares[id] ?? 0))
  const out: Record<Id, number> = {}
  ids.forEach((id, i) => { out[id] = parts[i] })
  return out
}

/** The bill's total in the group's currency. */
export function baseTotalOf(e: Expense): number {
  return e.fxRate === 1 ? totalOf(e) : Math.round(totalOf(e) * e.fxRate)
}

/** What one person owes on one expense, net of having paid it. */
export function netFor(e: Expense, personId: Id): number {
  const owed = computeBaseShares(e)[personId] ?? 0
  const paid = e.payerId === personId ? baseTotalOf(e) : 0
  return paid - owed
}

/** Drives the "12 of 40 decided" progress on an itemised bill. */
export function itemsDecided(e: Expense): { decided: number; total: number } {
  const items = e.items ?? []
  return {
    decided: items.filter((i) => i.eatenBy.some((m) => e.participants.includes(m))).length,
    total: items.length,
  }
}
