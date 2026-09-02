'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { computeShares, consumersOf } from '@/lib/split'
import { formatMinor } from '@/lib/money'
import type { Expense, Group } from '@/lib/types'
import { Amount, AnimatedAmount, Avatar, Button, DeltaBadge, Label, SplitBar } from '@/components/ui'
import { useAgentActivity } from '@/lib/webmcp/activity'

/**
 * One row per line, with the people who had it.
 * Unassigned lines are shared by everyone — which is the sane default and the
 * thing you only override where it matters.
 */
export function ItemSplitter({ expense, group, me }: { expense: Expense; group: Group; me: string | null }) {
  const assignItem = useApp((s) => s.assignItem)
  const updateExpense = useApp((s) => s.updateExpense)

  const touched = useAgentActivity((s) => s.touched)
  const deltas = useAgentActivity((s) => s.deltas)
  const people = group.members.filter((m) => expense.participants.includes(m.id))
  const shares = computeShares(expense)
  // What each person pays for food alone, so the rest of their share can be
  // named as what it is. Tax and service are a fifth of a bill like this and
  // are usually the part nobody looks at — which is exactly where an equal
  // split quietly overcharges whoever ate least.
  const extrasMinor = (expense.taxMinor ?? 0) + (expense.tipMinor ?? 0)
  const foodShares = computeShares({ ...expense, taxMinor: 0, tipMinor: 0 })
  const items = expense.items ?? []

  // Cascade the lines in the first time a bill becomes itemised — a receipt
  // turning into a split should look like it happened, not blink into place.
  const [fresh, setFresh] = useState(false)
  const seen = useRef<string | null>(null)
  useEffect(() => {
    const key = `${expense.id}:${items.length}`
    if (seen.current === null) { seen.current = key; return }
    if (seen.current !== key) {
      seen.current = key
      setFresh(true)
      const t = setTimeout(() => setFresh(false), 1200)
      return () => clearTimeout(t)
    }
  }, [expense.id, items.length])

  const toggle = useCallback((itemId: string, personId: string) => {
    const live = useApp.getState().expenses.find((e) => e.id === expense.id)
    const item = live?.items?.find((i) => i.id === itemId)
    if (!live || !item) return
    const current = consumersOf(item, live)
    const next = current.includes(personId)
      ? current.filter((p) => p !== personId)
      : [...current, personId]
    // Everyone selected is the same as shared by everyone.
    void assignItem(expense.id, itemId, next.length === live.participants.length ? [] : next)
  }, [expense.id, assignItem])

  const setAll = (itemId: string, ids: string[]) => assignItem(expense.id, itemId, ids)

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <Label>The bill · {items.length} items</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] text-ink-3">Tax &amp; service</span>
          <div className="flex gap-0.5 rounded-[9px] bg-sunken p-0.5">
            {(['proportional', 'equal'] as const).map((p) => (
              <button
                key={p} type="button"
                onClick={() => void updateExpense(expense.id, { extrasPolicy: p })}
                aria-pressed={expense.extrasPolicy === p}
                className={`h-7 rounded-[7px] px-2 text-[12px] font-semibold transition-all ${
                  expense.extrasPolicy === p ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'
                }`}
              >
                {p === 'proportional' ? 'by usage' : 'evenly'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ul className="grid gap-1.5">
        {items.map((item, index) => {
          const consumers = consumersOf(item, expense)
          const shared = item.eatenBy.filter((m) => expense.participants.includes(m)).length === 0
          const each = Math.round(item.amountMinor / Math.max(1, consumers.length))
          return (
            <li
              key={item.id}
              className={`rounded-[12px] border border-line bg-surface px-3 py-2 transition-colors ${
                touched[item.id] ? 'agent-touched' : ''
              }`}
              style={fresh ? {
                animation: 'line-in .34s cubic-bezier(.2,.9,.3,1) backwards',
                animationDelay: `${Math.min(index, 14) * 45}ms`,
              } : undefined}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[14.5px] font-medium">{item.label}</span>
                <Amount minor={item.amountMinor} currency={expense.currency} size="sm" className="shrink-0 text-ink-2" />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {people.map((p) => {
                  const on = consumers.includes(p.id)
                  return (
                    <button
                      key={p.id} type="button" onClick={() => toggle(item.id, p.id)}
                      aria-pressed={on}
                      aria-label={`${p.name} had ${item.label}${on ? ` — ${formatMinor(each, expense.currency)}` : ''}`}
                      title={on ? `${p.name} · ${formatMinor(each, expense.currency)}` : p.name}
                      className="rounded-full transition-all duration-150 hover:scale-105 active:scale-90"
                      style={{ opacity: on ? 1 : 0.4 }}
                    >
                      <Avatar person={p} size={30} muted={!on} ring={on} />
                    </button>
                  )
                })}
                <span className="ml-auto text-[12px] text-ink-3">
                  {shared ? 'everyone' : `${formatMinor(each, expense.currency)} each`}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      {(expense.taxMinor > 0 || expense.tipMinor > 0) && (
        <ul className="grid gap-1 px-1 text-[13.5px] text-ink-2">
          {expense.taxMinor > 0 && (
            <li className="flex justify-between"><span>Tax</span>
              <Amount minor={expense.taxMinor} currency={expense.currency} size="sm" /></li>
          )}
          {expense.tipMinor > 0 && (
            <li className="flex justify-between"><span>Tip &amp; service</span>
              <Amount minor={expense.tipMinor} currency={expense.currency} size="sm" /></li>
          )}
        </ul>
      )}

      <div className="rounded-[13px] bg-canvas p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label as="h3" id="pays-heading">Everyone pays</Label>
          {extrasMinor > 0 && (
            <span className="text-[12px] text-ink-3">
              incl. {formatMinor(extrasMinor, expense.currency)} tax &amp; service,{' '}
              {expense.extrasPolicy === 'proportional' ? 'by what people ate' : 'split evenly'}
            </span>
          )}
        </div>
        <SplitBar shares={shares} people={group.members} currency={expense.currency} className="mt-2.5" />
        <ul className="mt-3 grid gap-1.5" aria-labelledby="pays-heading">
          {people.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 text-[13.5px]">
              <Avatar person={m} size={22} />
              <span className="min-w-0 flex-1 truncate">
                {m.id === me ? 'You' : m.name}
                {extrasMinor > 0 && (
                  // Naming the two halves is the whole argument for itemising:
                  // eat less, and your share of the tax and tip is smaller too.
                  <span className="ml-1.5 whitespace-nowrap text-[12px] text-ink-2 tabular-nums">
                    {formatMinor(foodShares[m.id] ?? 0, expense.currency)}
                    {' + '}
                    {formatMinor((shares[m.id] ?? 0) - (foodShares[m.id] ?? 0), expense.currency)}
                  </span>
                )}
              </span>
              {deltas[m.id] !== undefined && (
                <DeltaBadge minor={deltas[m.id]} currency={expense.currency} />
              )}
              <AnimatedAmount minor={shares[m.id] ?? 0} currency={expense.currency} size="sm" className="font-semibold" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
