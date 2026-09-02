'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/store'
import { debtCount, minTransfers, netBalances } from '@/lib/settle'
import type { Group, Transfer } from '@/lib/types'
import { formatMinor } from '@/lib/money'
import { AnimatedAmount, Amount, Avatar, Button, Card, DeltaBadge, EmptyState, Label } from '@/components/ui'
import { ShareSummary } from '@/components/ShareSummary'
import { useAgentActivity } from '@/lib/webmcp/activity'
import { toast } from '@/components/Toast'

export function BalancesTab({ group, me }: { group: Group; me: string | null }) {
  const allExpenses = useApp((s) => s.expenses)
  const allSettlements = useApp((s) => s.settlements)
  const settle = useApp((s) => s.settle)
  const unsettle = useApp((s) => s.unsettle)
  const touched = useAgentActivity((s) => s.touched)
  const deltas = useAgentActivity((s) => s.deltas)

  const [confirming, setConfirming] = useState<Transfer | null>(null)
  const [sharing, setSharing] = useState(false)

  const expenses = useMemo(
    () => allExpenses.filter((e) => e.groupId === group.id), [allExpenses, group.id])
  const settlements = useMemo(
    () => allSettlements.filter((s) => s.groupId === group.id), [allSettlements, group.id])

  const { balances, plan, debts } = useMemo(() => {
    const b = netBalances(expenses, settlements)
    return { balances: b, plan: minTransfers(b), debts: debtCount(expenses) }
  }, [expenses, settlements])

  const person = (id: string) => group.members.find((m) => m.id === id)!
  const name = (id: string) => (id === me ? 'You' : person(id).name)
  const same = (a: Transfer | null, b: Transfer) =>
    a !== null && a.from === b.from && a.to === b.to && a.amountMinor === b.amountMinor

  return (
    <div className="grid gap-5">
      <Card className="p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <Label as="h2">Where everyone stands</Label>
          <Button size="sm" variant="ghost" onClick={() => setSharing(true)}>Share summary</Button>
        </div>
        <ul className="mt-3 grid gap-1">
          {group.members.map((m) => {
            const v = balances[m.id] ?? 0
            const isYou = m.id === me
            const inner = (
              <>
                <Avatar person={m} size={34} />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[15px] font-medium">{isYou ? 'You' : m.name}</span>
                  <span className="text-[13px] text-ink-3">
                    {v > 0 ? 'is owed' : v < 0 ? 'owes the group' : 'all square'}
                  </span>
                </span>
                {deltas[m.id] !== undefined && <DeltaBadge minor={deltas[m.id]} currency={group.currency} />}
                <AnimatedAmount minor={Math.abs(v)} currency={group.currency} size="md"
                  tone={v > 0 ? 'positive' : v < 0 ? 'negative' : 'muted'} className="font-semibold" />
              </>
            )
            return (
              <li key={m.id}>
                {isYou ? (
                  <div className="flex items-center gap-3 px-1 py-1.5">{inner}</div>
                ) : (
                  <Link
                    href={`/g/${group.id}/p/${m.id}`}
                    className={`-mx-1 flex items-center gap-3 rounded-[11px] px-1 py-1.5 transition-colors hover:bg-canvas ${
                      touched[m.id] ? 'agent-touched' : ''
                    }`}
                  >
                    {inner}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-ink-3">
                      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5">
          <Label as="h2">Settle up</Label>
          {plan.length > 0 && (
            <span className="text-[12.5px] text-ink-3">
              <span className="tnum">{debts}</span> debts →{' '}
              <span className="tnum font-semibold text-ink-2">{plan.length}</span> payments
            </span>
          )}
        </div>

        {plan.length === 0 ? (
          <EmptyState title="Everyone’s square" body="No payments needed. Add an expense and this will fill back in." />
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {plan.map((t, i) => (
              <li key={`${t.from}-${t.to}-${i}`} className="px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <Avatar person={person(t.from)} size={30} />
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-ink-3">
                    <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <Avatar person={person(t.to)} size={30} />
                  <span className="min-w-0 flex-1 truncate text-[14px]">
                    <span className="font-medium">{name(t.from)}</span>
                    <span className="text-ink-2"> pays </span>
                    <span className="font-medium">{name(t.to)}</span>
                  </span>
                  <Amount minor={t.amountMinor} currency={group.currency} size="md" className="font-semibold" />
                  {!same(confirming, t) && (
                    <Button size="sm" onClick={() => setConfirming(t)}>Settle</Button>
                  )}
                </div>

                {/* Confirming in place rather than in a modal: you can still see
                    the row you're confirming. */}
                {same(confirming, t) && (
                  <div className="mt-2.5 grid gap-2 rounded-[11px] bg-canvas p-3">
                    <p className="text-[13.5px] leading-relaxed text-ink-2 text-pretty">
                      Record that {name(t.from)} paid {name(t.to)}{' '}
                      <strong className="font-semibold text-ink">
                        {formatMinor(t.amountMinor, group.currency)}
                      </strong>? Everyone in the group sees it.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => setConfirming(null)}>Cancel</Button>
                      <Button
                        size="sm" variant="primary" className="flex-1"
                        onClick={() => {
                          void settle(group.id, t)
                          setConfirming(null)
                          toast('Payment recorded', { tone: 'success' })
                        }}
                      >
                        Mark as paid
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {settlements.length > 0 && (
        <div>
          <Label as="h2" className="px-1">Already paid</Label>
          <ul className="mt-2 grid gap-1">
            {settlements.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5 px-1 text-[13.5px] text-ink-2">
                <Avatar person={person(s.from)} size={22} />
                <span className="min-w-0 flex-1 truncate">{name(s.from)} paid {name(s.to)}</span>
                <Amount minor={s.amountMinor} currency={group.currency} size="sm" />
                <button
                  onClick={() => { void unsettle(s.id); toast('Payment undone') }}
                  className="rounded-[8px] px-1.5 py-0.5 text-[12.5px] font-semibold text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sharing && (
        <ShareSummary group={group} expenses={expenses} settlements={settlements}
          me={me} onClose={() => setSharing(false)} />
      )}
    </div>
  )
}
