import { baseTotalOf, computeBaseShares } from './split'
import type { Expense, Id, Settlement, Transfer } from './types'

/**
 * Net position per person.
 * Positive means the group owes them; negative means they owe the group.
 * Always sums to zero.
 */
export function netBalances(expenses: Expense[], settlements: Settlement[] = []): Record<Id, number> {
  const net: Record<Id, number> = {}
  const bump = (id: Id, delta: number) => { net[id] = (net[id] ?? 0) + delta }

  // Everything here is in the group's currency, so a trip paid partly in baht
  // and partly in rupees still nets to zero.
  for (const e of expenses) {
    for (const [id, owed] of Object.entries(computeBaseShares(e))) bump(id, -owed)
    bump(e.payerId, baseTotalOf(e))
  }
  for (const s of settlements) {
    bump(s.from, s.amountMinor)
    bump(s.to, -s.amountMinor)
  }
  return net
}

/**
 * Greedy largest-creditor / largest-debtor matching.
 *
 * The true minimum is NP-hard (it is subset-sum in disguise), so this is the
 * standard approximation every expense app ships. It yields at most n-1
 * transfers and always settles every balance to exactly zero, which is the
 * property a user actually cares about.
 */
export function minTransfers(balances: Record<Id, number>): Transfer[] {
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .map(([id, amt]) => ({ id, amt }))
    .sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id))

  const debtors = Object.entries(balances)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amt: -v }))
    .sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id))

  const out: Transfer[] = []
  let c = 0
  let d = 0
  while (c < creditors.length && d < debtors.length) {
    const pay = Math.min(creditors[c].amt, debtors[d].amt)
    if (pay > 0) out.push({ from: debtors[d].id, to: creditors[c].id, amountMinor: pay })
    creditors[c].amt -= pay
    debtors[d].amt -= pay
    if (creditors[c].amt === 0) c++
    if (debtors[d].amt === 0) d++
  }
  return out
}

/** How many separate debts the settle-up plan collapses. */
export function debtCount(expenses: Expense[]): number {
  return expenses.reduce(
    (n, e) => n + e.participants.filter((p) => p !== e.payerId).length,
    0,
  )
}
