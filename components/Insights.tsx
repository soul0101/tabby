'use client'
import { useMemo } from 'react'
import { computeShares, totalOf } from '@/lib/split'
import { formatMinor } from '@/lib/money'
import { CATEGORY_EMOJI, type Category, type Expense, type Group } from '@/lib/types'
import { solid } from '@/lib/palette'
import { Amount, Avatar, Card, EmptyState, Label, SplitBar } from '@/components/ui'

/**
 * The payoff. After a trip you don't want a ledger, you want to know where the
 * money went and who carried it — answered before you read a single number.
 */
export function Insights({ group, expenses, me }: { group: Group; expenses: Expense[]; me: string | null }) {
  const data = useMemo(() => {
    const total = expenses.reduce((s, e) => s + totalOf(e), 0)

    const byCategory = new Map<Category, number>()
    const spentBy: Record<string, number> = {}
    const paidBy: Record<string, number> = {}

    for (const e of expenses) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + totalOf(e))
      paidBy[e.payerId] = (paidBy[e.payerId] ?? 0) + totalOf(e)
      for (const [id, v] of Object.entries(computeShares(e))) spentBy[id] = (spentBy[id] ?? 0) + v
    }

    const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
    const biggest = [...expenses].sort((a, b) => totalOf(b) - totalOf(a)).slice(0, 3)

    const days = new Set(expenses.map((e) => e.occurredAt.slice(0, 10))).size
    return { total, categories, spentBy, paidBy, biggest, days }
  }, [expenses])

  if (expenses.length === 0) {
    return (
      <Card>
        <EmptyState title="Nothing to show yet" body="Add a few expenses and this fills in with where the money actually went." />
      </Card>
    )
  }

  const nameOf = (id: string) => (id === me ? 'You' : group.members.find((m) => m.id === id)?.name ?? '')
  const catTotal = data.categories.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <Label as="h2">Total spent</Label>
        <div className="mt-1">
          <Amount minor={data.total} currency={group.currency} size="hero" />
        </div>
        <p className="mt-1.5 text-[14px] text-ink-2">
          {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
          {data.days > 1 && <> across {data.days} days</>}
          {' · '}
          {formatMinor(Math.round(data.total / group.members.length), group.currency)} a head
        </p>
      </Card>

      <Card className="p-5">
        <Label as="h2">Where it went</Label>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full" role="img"
          aria-label={data.categories.map(([c, v]) => `${c} ${formatMinor(v, group.currency)}`).join(', ')}>
          {data.categories.map(([c, v], i) => (
            <span key={c} className="h-full transition-[width] duration-500"
              style={{ width: `${(v / catTotal) * 100}%`, background: solid(25 + i * 47) }} />
          ))}
        </div>
        <ul className="mt-4 grid gap-2.5">
          {data.categories.map(([c, v], i) => (
            <li key={c} className="flex items-center gap-3">
              <span aria-hidden="true" className="emoji grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-sunken text-[15px]">
                {CATEGORY_EMOJI[c]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium capitalize">{c}</span>
                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-sunken">
                  <span className="block h-full rounded-full"
                    style={{ width: `${(v / data.categories[0][1]) * 100}%`, background: solid(25 + i * 47) }} />
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Amount minor={v} currency={group.currency} size="sm" className="block font-semibold" />
                <span className="text-[12px] text-ink-3">{Math.round((v / catTotal) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <Label as="h2">Who spent what</Label>
        <p className="mt-1 text-[13px] text-ink-3">Their share of the bills, not what they paid out.</p>
        <SplitBar shares={data.spentBy} people={group.members} currency={group.currency} className="mt-3" height={8} />
        <ul className="mt-4 grid gap-2.5">
          {group.members
            .map((m) => ({ m, spent: data.spentBy[m.id] ?? 0, paid: data.paidBy[m.id] ?? 0 }))
            .sort((a, b) => b.spent - a.spent)
            .map(({ m, spent, paid }) => (
              <li key={m.id} className="flex items-center gap-3">
                <Avatar person={m} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{nameOf(m.id)}</span>
                  <span className="text-[12.5px] text-ink-3">
                    paid <Amount minor={paid} currency={group.currency} size="sm" className="text-ink-3" />
                  </span>
                </span>
                <Amount minor={spent} currency={group.currency} size="md" className="font-semibold" />
              </li>
            ))}
        </ul>
      </Card>

      <Card className="p-5">
        <Label as="h2">Biggest hits</Label>
        <ul className="mt-3 grid gap-2.5">
          {data.biggest.map((e, i) => (
            <li key={e.id} className="flex items-center gap-3">
              <span className="tnum w-5 shrink-0 font-display text-[15px] font-semibold text-ink-3">{i + 1}</span>
              <span aria-hidden="true" className="emoji grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-sunken text-[15px]">
                {CATEGORY_EMOJI[e.category]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{e.description}</span>
              <Amount minor={totalOf(e)} currency={group.currency} size="md" className="font-semibold" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
