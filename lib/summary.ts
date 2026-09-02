import { computeShares, totalOf } from './split'
import { minTransfers, netBalances } from './settle'
import { formatMinor } from './money'
import type { Expense, Group, Id, Settlement } from './types'

/**
 * A plain-text recap, because closing out a trip happens in a group chat.
 * No markdown — WhatsApp mangles it.
 */
export function tripSummary(
  group: Group, expenses: Expense[], settlements: Settlement[], me: Id | null,
): string {
  const cur = group.currency
  const money = (m: number) => formatMinor(m, cur)
  const name = (id: Id) => (id === me ? 'You' : group.members.find((x) => x.id === id)?.name ?? '?')

  const total = expenses.reduce((s, e) => s + totalOf(e), 0)
  const balances = netBalances(expenses, settlements)
  const plan = minTransfers(balances)

  const spent: Record<Id, number> = {}
  for (const e of expenses) {
    for (const [id, v] of Object.entries(computeShares(e))) spent[id] = (spent[id] ?? 0) + v
  }

  const lines: string[] = []
  lines.push(`${group.emoji} ${group.name}`)
  lines.push(`${money(total)} across ${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`)
  lines.push('')

  lines.push('Who spent what')
  for (const m of group.members) {
    const v = spent[m.id] ?? 0
    if (v > 0) lines.push(`· ${name(m.id)} — ${money(v)}`)
  }

  lines.push('')
  if (plan.length === 0) {
    lines.push('All settled up.')
  } else {
    lines.push(`Settle up (${plan.length} ${plan.length === 1 ? 'payment' : 'payments'})`)
    for (const t of plan) lines.push(`· ${name(t.from)} pays ${name(t.to)} ${money(t.amountMinor)}`)
  }

  lines.push('')
  lines.push('— via Tabby')
  return lines.join('\n')
}
