'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/store'
import { affectedBy, isEmptyDiff, liveDiff, sameEffect, summarisePatch } from '@/lib/proposal'
import { formatMinor } from '@/lib/money'
import { CATEGORY_EMOJI, type Group, type Message } from '@/lib/types'
import { Avatar, Button } from '@/components/ui'
import { ReceiptThumb } from '@/components/ReceiptImage'
import { toast } from '@/components/Toast'

/**
 * A change waiting on a person.
 *
 * The diff is the point: you approve a specific movement of money, shown
 * against real names, not a sentence describing one. Once resolved the card
 * greys out but stays — the record of what was asked and who decided is worth
 * more than a tidy thread.
 */
export function ProposalCard({
  message, group, me, showExpenseLink = false,
}: {
  message: Message
  group: Group
  me: string | null
  /** Shown in the group's Waiting list, where the bill isn't already on screen. */
  showExpenseLink?: boolean
}) {
  const accept = useApp((s) => s.accept)
  const reject = useApp((s) => s.reject)
  const withdraw = useApp((s) => s.withdraw)
  const [busy, setBusy] = useState<'accept' | 'reject' | 'withdraw' | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  const pending = message.status === 'pending'
  const nameOf = (id: string) =>
    id === me ? 'You' : group.members.find((m) => m.id === id)?.name ?? 'Someone'
  const person = (id: string) => group.members.find((m) => m.id === id)

  const expenses = useApp((s) => s.expenses)
  const settlements = useApp((s) => s.settlements)

  // A pending draft is costed live, so what you approve is what it will
  // actually do — not what it would have done when it was suggested. A
  // resolved one keeps the diff it was decided on.
  const fresh = useMemo(
    () => (pending && message.patch
      ? liveDiff(
          message.patch, group,
          expenses.filter((e) => e.groupId === group.id),
          settlements.filter((s) => s.groupId === group.id),
          nameOf,
        )
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, message.patch, expenses, settlements, group],
  )
  const diff = fresh ?? message.diff
  const drifted = Boolean(
    pending && fresh && message.diff && !sameEffect(fresh, message.diff),
  )

  // An add_expense proposal can carry the photo of the bill it came from. It
  // is the thing you'd want to look at before agreeing to the numbers.
  const proposedReceipt =
    message.patch?.kind === 'add_expense' ? message.patch.input.receiptPath ?? null : null

  const rows = diff
    ? Object.keys({ ...diff.before, ...diff.after })
        .map((id) => ({
          id,
          before: diff.before[id] ?? 0,
          after: diff.after[id] ?? 0,
          delta: (diff.after[id] ?? 0) - (diff.before[id] ?? 0),
        }))
        .filter((r) => r.delta !== 0 || diff.scope === 'expense')
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    : []

  const expense = useApp((s) => s.expenses.find((e) => e.id === message.expenseId))
  const affected = diff ? affectedBy(diff) : []
  const youAreAffected = me !== null && affected.includes(me)
  const noop = diff ? isEmptyDiff(diff) : false
  // The first revision is the card's title; the rest are how it got here.
  const steps = message.revisions.length > 1 ? message.revisions : []

  const mine = me !== null && message.authorMember === me

  const run = async (what: 'accept' | 'reject' | 'withdraw') => {
    setBusy(what)
    try {
      if (what === 'accept') { await accept(message.id); toast('Applied', { tone: 'success' }) }
      else if (what === 'withdraw') { await withdraw(message.id); toast('Taken back') }
      else { await reject(message.id, note.trim() || undefined); toast('Declined') }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That didn’t work', { tone: 'error' })
    } finally {
      setBusy(null); setRejecting(false)
    }
  }

  return (
    <article
      className="rounded-[14px] border transition-opacity"
      style={{
        borderColor: pending ? 'var(--color-agent)' : 'var(--color-line)',
        background: pending ? 'var(--color-surface)' : 'var(--color-canvas)',
        opacity: pending ? 1 : 0.72,
        boxShadow: pending ? '0 2px 10px -4px rgba(76,86,140,.25)' : undefined,
      }}
    >
      <header className="flex items-start gap-2.5 px-3.5 pb-2 pt-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
          style={{ background: 'var(--color-agent-wash)', color: 'var(--color-agent)' }}
        >
          ✦
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-snug text-pretty">
            {steps.length > 0 ? summarisePatch(message.patch!) : message.body}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {steps.length > 0
              ? `${steps.length} adjustments · `
              : `${summarisePatch(message.patch!)} · `}
            {mine
              ? 'your agent'
              : `${message.authorMember ? nameOf(message.authorMember) : 'someone'}’s agent`}
          </p>
        </div>
        {proposedReceipt && (
          <ReceiptThumb path={proposedReceipt} alt="The bill being proposed" size={40} />
        )}
        <StatusPill status={message.status!} />
      </header>

      {showExpenseLink && expense && (
        <Link
          href={`/g/${group.id}/e/${expense.id}`}
          className="mx-3.5 mb-3 flex items-center gap-2 rounded-[10px] bg-canvas px-3 py-2 text-[12.5px] transition-colors hover:bg-sunken"
        >
          <span aria-hidden="true" className="emoji">{CATEGORY_EMOJI[expense.category]}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{expense.description}</span>
          <span className="shrink-0 text-ink-3">Open the bill →</span>
        </Link>
      )}

      {steps.length > 0 && (
        <ol className="mx-3.5 mb-3 grid gap-1.5 rounded-[11px] bg-canvas px-3 py-2.5">
          {steps.map((r, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-ink-2 text-pretty">
              <span aria-hidden="true" className="tnum shrink-0 font-semibold text-ink-3">{i + 1}.</span>
              {r.body}
            </li>
          ))}
        </ol>
      )}

      {drifted && !noop && (
        <p className="mx-3.5 mb-3 rounded-[11px] bg-canvas px-3 py-2.5 text-[12.5px] leading-snug text-ink-2 text-pretty">
          The bill has changed since this was suggested. The figures below are what it would do now.
        </p>
      )}

      {noop && pending && (
        <p className="mx-3.5 mb-3 rounded-[11px] bg-warn-wash px-3 py-2.5 text-[12.5px] leading-snug text-warn text-pretty">
          As it stands this wouldn’t change anyone’s share — the bill already says this
          {drifted && ', because it changed since this was suggested'}. Ask your agent to adjust it,
          or decline.
        </p>
      )}

      {diff && rows.length > 0 && !noop && (
        <div className="mx-3.5 mb-3 overflow-hidden rounded-[11px] border border-line bg-canvas">
          <div className="flex items-baseline justify-between border-b border-line px-3 py-1.5">
            <span className="label">{diff.scope === 'expense' ? 'This bill' : 'Balances'}</span>
            <span className="text-[12px] text-ink-2">{diff.headline}</span>
          </div>
          <ul>
            {rows.map((r) => {
              const p = person(r.id)
              return (
                <li key={r.id} className="flex items-center gap-2.5 border-b border-line/60 px-3 py-1.5 last:border-0">
                  {p && <Avatar person={p} size={20} />}
                  <span className="min-w-0 flex-1 truncate text-[13px]">{nameOf(r.id)}</span>
                  <span className="tnum text-[12.5px] text-ink-3 line-through">
                    {formatMinor(Math.abs(r.before), diff.currency)}
                  </span>
                  <span aria-hidden="true" className="text-ink-3">→</span>
                  <span className="tnum w-20 text-right text-[13px] font-semibold">
                    {formatMinor(Math.abs(r.after), diff.currency)}
                  </span>
                  <span
                    className="tnum w-16 shrink-0 text-right text-[11.5px] font-semibold"
                    style={{ color: r.delta > 0 ? 'var(--color-negative)' : r.delta < 0 ? 'var(--color-positive)' : 'var(--color-ink-3)' }}
                  >
                    {r.delta === 0 ? '—' : `${r.delta > 0 ? '+' : '−'}${formatMinor(Math.abs(r.delta), diff.currency)}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {pending ? (
        rejecting ? (
          <div className="grid gap-2 px-3.5 pb-3.5">
            <input
              value={note} autoFocus placeholder="Why not? (optional)"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void run('reject') }}
              className="h-9 w-full rounded-[9px] border border-line bg-surface px-3 text-[13.5px] focus:border-ink focus:outline-none"
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => setRejecting(false)}>Back</Button>
              <Button size="sm" variant="danger" className="flex-1" disabled={busy !== null}
                onClick={() => void run('reject')}>
                {busy === 'reject' ? 'Declining…' : 'Decline'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 px-3.5 pb-3.5">
            {youAreAffected && (
              <span className="mr-auto text-[12px] font-medium" style={{ color: 'var(--color-negative)' }}>
                You’d pay more
              </span>
            )}
            {mine && (
              <Button size="sm" variant="ghost" disabled={busy !== null}
                onClick={() => void run('withdraw')}>
                {busy === 'withdraw' ? 'Taking back…' : 'Withdraw'}
              </Button>
            )}
            <Button size="sm" className={youAreAffected || mine ? '' : 'flex-1'} disabled={busy !== null}
              onClick={() => setRejecting(true)}>
              Decline
            </Button>
            <Button size="sm" variant="primary" className={youAreAffected || mine ? '' : 'flex-1'}
              disabled={busy !== null || noop}
              onClick={() => void run('accept')}>
              {busy === 'accept' ? 'Applying…' : 'Accept'}
            </Button>
          </div>
        )
      ) : (
        <p className="px-3.5 pb-3 text-[12px] text-ink-3">
          {message.status === 'superseded'
            ? 'Replaced by a newer suggestion'
            : message.status === 'withdrawn'
              ? 'Withdrawn by the agent that proposed it'
              : message.status === 'accepted' ? 'Accepted' : 'Declined'}
          {message.status !== 'superseded' && message.status !== 'withdrawn'
            && message.resolvedBy && ` by ${nameOf(message.resolvedBy)}`}
          {message.resolutionNote && ` — “${message.resolutionNote}”`}
        </p>
      )}
    </article>
  )
}

function StatusPill({ status }: { status: NonNullable<Message['status']> }) {
  const map = {
    pending: { label: 'Needs a decision', fg: 'var(--color-agent)', bg: 'var(--color-agent-wash)' },
    accepted: { label: 'Accepted', fg: 'var(--color-positive)', bg: 'var(--color-positive-wash)' },
    rejected: { label: 'Declined', fg: 'var(--color-negative)', bg: 'var(--color-negative-wash)' },
    superseded: { label: 'Superseded', fg: 'var(--color-ink-3)', bg: 'var(--color-sunken)' },
    withdrawn: { label: 'Withdrawn', fg: 'var(--color-ink-3)', bg: 'var(--color-sunken)' },
  }[status]
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: map.fg, background: map.bg }}>
      {map.label}
    </span>
  )
}
