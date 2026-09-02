'use client'
import { useMemo } from 'react'
import { useApp } from '@/lib/store'
import { formatMinor } from '@/lib/money'
import { Avatar, Card, EmptyState, Label } from '@/components/ui'
import type { Activity, Group } from '@/lib/types'

const when = (iso: string) => {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * What happened to this bill, and who did it.
 *
 * The group's activity list answers "what has been going on"; this answers
 * "why is my share what it is", which is the question that actually starts
 * arguments. So each entry carries the change rather than a link to the
 * current state — the items that moved, and what it cost each person.
 */
export function ExpenseHistory({
  entries, group, currency,
}: { entries: Activity[]; group: Group; currency: string }) {
  const personOf = (id: string | null) => group.members.find((m) => m.id === id)
  const nameOf = (id: string | null) => personOf(id)?.name ?? 'Someone'

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing has changed yet"
        body="Every edit to this bill lands here — who made it, what moved, and what it did to each person’s share."
      />
    )
  }

  return (
    <ol className="grid gap-2.5" aria-label="What happened to this bill">
      {entries.map((a) => {
        const byAgent = a.detail.via === 'agent'
        const items = a.detail.items ?? []
        const shares = a.detail.shares ?? []
        return (
          <li key={a.id}>
            <Card className="p-3.5">
              <div className="flex items-start gap-2.5">
                {byAgent ? (
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                    style={{ background: 'var(--color-agent-wash)', color: 'var(--color-agent)' }}
                  >
                    ✦
                  </span>
                ) : (
                  <span className="mt-0.5 shrink-0">
                    <Avatar person={personOf(a.actorMember) ?? { id: 'x', name: 'Someone', hue: 0 }} size={20} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {/* When an agent gave a reason, that is the better headline —
                      "Ravi is vegetarian, off the seafood" says more than
                      "changed who had 2 items". */}
                  <p className="text-[13.5px] font-semibold leading-snug text-pretty">
                    {byAgent && a.detail.reason ? a.detail.reason : a.summary}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {byAgent
                      ? `${nameOf(a.actorMember)} accepted their agent’s suggestion`
                      : `${nameOf(a.actorMember)}, by hand`}
                    {' · '}{when(a.createdAt)}
                  </p>
                </div>
              </div>

              {items.length > 0 && (
                <ul className="mt-2.5 grid gap-1 border-t border-line pt-2.5">
                  {items.map((it) => (
                    <li key={it.label} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                      <span className="font-medium">{it.label}</span>
                      {it.removed.length > 0 && (
                        <span className="text-negative">− {it.removed.join(', ')}</span>
                      )}
                      {it.added.length > 0 && (
                        <span className="text-positive">+ {it.added.join(', ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {shares.length > 0 && (
                <div className="mt-2.5 border-t border-line pt-2.5">
                  <Label className="mb-1.5">What it cost</Label>
                  <ul className="grid gap-1">
                    {shares.map((r) => {
                      const delta = r.afterMinor - r.beforeMinor
                      return (
                        <li key={r.name} className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="min-w-0 truncate">{r.name}</span>
                          <span className="flex items-baseline gap-2 tabular-nums">
                            <span className="text-ink-3 line-through">
                              {formatMinor(r.beforeMinor, currency)}
                            </span>
                            <span aria-hidden="true" className="text-ink-3">→</span>
                            <span className="font-semibold">{formatMinor(r.afterMinor, currency)}</span>
                            <span className={delta < 0 ? 'text-positive' : 'text-negative'}>
                              {delta < 0 ? '−' : '+'}{formatMinor(Math.abs(delta), currency)}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </Card>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * This bill's history, newest first.
 *
 * Derived with useMemo rather than inside the selector: a selector that builds
 * a new array returns a new reference every time zustand checks it, which is an
 * endless re-render rather than a subscription.
 */
export function useExpenseHistory(expenseId: string) {
  const activity = useApp((s) => s.activity)
  return useMemo(
    () => activity
      .filter((a) => a.expenseId === expenseId)
      .slice()
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
    [activity, expenseId],
  )
}
