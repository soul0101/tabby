'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/store'
import type { Activity, Group } from '@/lib/types'
import { Amount, Avatar, Card, EmptyState, Label } from '@/components/ui'

const ICON: Record<Activity['kind'], string> = {
  group_created: '✨', member_added: '👋', member_removed: '👋',
  expense_added: '＋', expense_edited: '✎', expense_deleted: '✕',
  settlement_added: '✓', settlement_undone: '↺',
  proposal_made: '✦', proposal_accepted: '✓', proposal_rejected: '✕',
}

/** Agent activity gets its own colour so it reads apart from what people did. */
const isAgentKind = (k: Activity['kind']) => k === 'proposal_made'

const relative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Who did what, so a shared ledger isn't a black box. */
export function ActivityTab({ group, me }: { group: Group; me: string | null }) {
  const all = useApp((s) => s.activity)
  const expenses = useApp((s) => s.expenses)
  const rows = useMemo(
    () => all.filter((a) => a.groupId === group.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [all, group.id],
  )

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title="Nothing here yet" body="Everything that happens in this group shows up here — who added what, and when." />
      </Card>
    )
  }

  return (
    <Card className="p-4 sm:p-5">
      <Label as="h2">Activity</Label>
      <ul className="mt-3 grid">
        {rows.map((a) => {
          const actor = group.members.find((m) => m.id === a.actorMember)
          // Only link where the expense still exists — a deleted one keeps its
          // entry in the history but has nowhere to go.
          const target = a.expenseId && expenses.some((e) => e.id === a.expenseId)
            ? `/g/${group.id}/e/${a.expenseId}`
            : null

          const body = (
            <>
              {isAgentKind(a.kind) ? (
                <span
                  aria-hidden="true"
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[13px] font-bold"
                  style={{ background: 'var(--color-agent-wash)', color: 'var(--color-agent)' }}
                >
                  ✦
                </span>
              ) : actor ? (
                <Avatar person={actor} size={30} />
              ) : (
                <span aria-hidden="true" className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-sunken text-[13px] text-ink-3">
                  {ICON[a.kind]}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-snug text-pretty">
                  {actor && !isAgentKind(a.kind) && (
                    <strong className="font-semibold">{actor.id === me ? 'You' : actor.name} </strong>
                  )}
                  {actor && isAgentKind(a.kind) && (
                    <strong className="font-semibold">
                      {actor.id === me ? 'Your' : `${actor.name}’s`} agent{' '}
                    </strong>
                  )}
                  <span className="text-ink-2">
                    {isAgentKind(a.kind)
                      ? a.summary.replace(/^Agent suggested: /, 'suggested “') + '”'
                      : lowerFirst(a.summary, Boolean(actor))}
                  </span>
                </span>
                <span className="text-[12.5px] text-ink-3">{relative(a.createdAt)}</span>
              </span>
              {a.amountMinor !== null && a.amountMinor > 0 && (
                <Amount minor={a.amountMinor} currency={group.currency} size="sm" className="shrink-0 text-ink-2" />
              )}
              {target && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                  className="shrink-0 text-ink-3">
                  <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </>
          )

          return (
            <li key={a.id} className="border-b border-line/70 last:border-0">
              {target ? (
                <Link
                  href={target}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-[11px] px-2 py-2.5 transition-colors hover:bg-canvas"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-3 py-2.5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** "Added X" reads oddly after a name; "added X" doesn't. */
const lowerFirst = (text: string, hasActor: boolean) =>
  hasActor && /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text
