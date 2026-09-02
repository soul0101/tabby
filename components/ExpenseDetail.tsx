'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { seatOf } from '@/lib/me'
import { computeShares, itemsDecided, totalOf, baseTotalOf } from '@/lib/split'
import { CATEGORY_EMOJI } from '@/lib/types'
import { Shell } from '@/components/Shell'
import { Tabs } from '@/components/Tabs'
import { ItemSplitter } from '@/components/ItemSplitter'
import { ExpenseHistory, useExpenseHistory } from '@/components/ExpenseHistory'
import { Thread } from '@/components/Thread'
import { ReceiptCard } from '@/components/ReceiptImage'
import {
  AnimatedAmount, Amount, Avatar, Button, Card, DeltaBadge, EmptyState, Label, SplitBar,
} from '@/components/ui'
import { useAgentActivity } from '@/lib/webmcp/activity'
import { toast } from '@/components/Toast'

type Tab = 'split' | 'discussion' | 'history'

export function ExpenseDetail({ groupId, expenseId }: { groupId: string; expenseId: string }) {
  const [tab, setTab] = useState<Tab>('split')
  const decidedAt = useApp((s) => s.decidedAt)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const history = useExpenseHistory(expenseId)
  const router = useRouter()

  const groups = useApp((s) => s.groups)
  const expenses = useApp((s) => s.expenses)
  const messages = useApp((s) => s.messages)
  const you = useApp((s) => s.you)
  const status = useApp((s) => s.status)
  const deleteExpense = useApp((s) => s.deleteExpense)
  const restoreExpense = useApp((s) => s.restoreExpense)
  const setOpenGroup = useApp((s) => s.setOpenGroup)
  const deltas = useAgentActivity((s) => s.deltas)

  const group = useMemo(() => groups.find((g) => g.id === groupId), [groups, groupId])
  const expense = useMemo(() => expenses.find((e) => e.id === expenseId), [expenses, expenseId])
  const me = useMemo(() => (group ? seatOf(group, you) : null), [group, you])
  const pending = useMemo(
    () => messages.filter(
      (m) => m.expenseId === expenseId && m.kind === 'proposal' && m.status === 'pending').length,
    [messages, expenseId],
  )

  // Publish context so the agent knows which expense is on screen.
  useEffect(() => {
    setOpenGroup(groupId)
    return () => setOpenGroup(null)
  }, [groupId, setOpenGroup])

  // A proposal arriving pulls you to it rather than hiding behind a badge, and
  // once you've decided, back to the split so you see it land.
  //
  // But the second half fires whenever the accept *resolves*, which can be many
  // seconds after the click on a distant database — long enough that you may
  // have deliberately gone somewhere else in the meantime. Moving you then is
  // the page snatching the wheel. So a tab you chose by hand wins, until the
  // next proposal arrives and there is something new worth showing you.
  // Starts at zero so opening an expense that already has a proposal waiting
  // counts as one arriving, and shows it to you.
  const wasPending = useRef(0)
  // When you last picked a tab yourself. Compared against when the decision
  // was made: showing you the result of the accept you just clicked is
  // helpful, but the same move is the page snatching the wheel if you have
  // since gone somewhere else — and on a distant database "since" can be
  // twenty seconds wide.
  const choseAt = useRef(0)
  const choose = (t: Tab) => { choseAt.current = Date.now(); setTab(t) }
  useEffect(() => {
    if (pending > wasPending.current) { choseAt.current = 0; setTab('discussion') }
    else if (pending === 0 && wasPending.current > 0 && choseAt.current < decidedAt) setTab('split')
    wasPending.current = pending
  }, [pending, decidedAt])

  if (status === 'loading') {
    return (
      <Shell back={{ href: `/g/${groupId}`, label: 'Back' }}>
        <div className="grid gap-3">
          <div className="h-20 animate-pulse rounded-[16px] bg-sunken" />
          <div className="h-10 animate-pulse rounded-[12px] bg-sunken" />
          <div className="h-48 animate-pulse rounded-[16px] bg-sunken" />
        </div>
      </Shell>
    )
  }

  if (!group || !expense) {
    return (
      <Shell back={{ href: `/g/${groupId}`, label: 'Back' }}>
        <Card>
          <EmptyState title="Expense not found"
            body="It may have been deleted, or the link is wrong."
            action={<Button variant="primary" onClick={() => router.push(`/g/${groupId}`)}>Back to the group</Button>} />
        </Card>
      </Shell>
    )
  }

  const shares = computeShares(expense)
  const total = totalOf(expense)
  const payer = group.members.find((m) => m.id === expense.payerId)
  const nameOf = (id: string) => (id === me ? 'You' : group.members.find((m) => m.id === id)?.name ?? id)
  const decided = expense.splitMode === 'items' ? itemsDecided(expense) : null
  const people = group.members.filter((m) => expense.participants.includes(m.id))

  const remove = () => {
    // The row is only marked deleted, so undo restores this exact expense —
    // same id, same items, same discussion — rather than a lookalike copy.
    const { id, description } = expense
    void deleteExpense(id)
    router.push(`/g/${groupId}`)
    toast(`Deleted “${description}”`, {
      undo: async () => { await restoreExpense(id); toast('Put it back', { tone: 'success' }) },
    })
  }

  return (
    <Shell
      back={{ href: `/g/${groupId}`, label: group.name }}
      action={
        <Link
          href={`/g/${groupId}/e/${expenseId}/edit`}
          className="inline-flex h-9 items-center rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold transition-colors hover:bg-canvas"
        >
          Edit
        </Link>
      }
    >
      <header className="mb-5">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="emoji grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-sunken text-[20px]">
            {CATEGORY_EMOJI[expense.category]}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-bold leading-tight tracking-[-0.02em] text-balance">
              {expense.description}
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-2">
              {new Date(expense.occurredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}{nameOf(expense.payerId)} paid
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <Label>Total</Label>
            <div className="mt-0.5">
              <Amount minor={total} currency={expense.currency} size="hero" />
            </div>
            {expense.currency !== group.currency && (
              <p className="mt-1 text-[13px] text-ink-2">
                <Amount minor={baseTotalOf(expense)} currency={group.currency} size="sm" className="text-ink-2" />
                {' at '}{expense.fxRate.toFixed(2)}
              </p>
            )}
          </div>
          {payer && (
            <div className="flex items-center gap-2 pb-1 text-[13.5px] text-ink-2">
              <Avatar person={payer} size={30} />
              {nameOf(payer.id)} paid
            </div>
          )}
        </div>

        <SplitBar shares={shares} people={group.members} height={8} currency={expense.currency} className="mt-3.5" />
      </header>

      <Tabs
        label="Expense views"
        value={tab}
        onChange={choose}
        tabs={[
          { id: 'split', label: 'Split' },
          { id: 'discussion', label: 'Discussion', badge: pending },
          { id: 'history', label: 'History' },
        ]}
      />

      <div className="mt-5">
        {tab === 'split' ? (
          <div className="grid gap-5">
            {expense.receiptPath && (
              <ReceiptCard path={expense.receiptPath} alt={`Receipt for ${expense.description}`} />
            )}

            {expense.splitMode === 'items' ? (
              <ItemSplitter expense={expense} group={group} me={me} />
            ) : (
              <Card className="p-4 sm:p-5">
                <div className="flex items-baseline justify-between">
                  <Label as="h2">
                    Split {expense.splitMode === 'equal' ? 'equally'
                      : expense.splitMode === 'shares' ? 'by shares' : 'by exact amounts'}
                  </Label>
                  <span className="text-[13px] text-ink-3">{people.length} people</span>
                </div>
                <ul className="mt-3 grid gap-1.5" aria-label="What each person pays">
                  {people.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 py-1">
                      <Avatar person={m} size={30} />
                      <span className="min-w-0 flex-1 truncate text-[14.5px]">{nameOf(m.id)}</span>
                      {expense.splitMode === 'shares' && (
                        <span className="text-[12.5px] text-ink-3">{expense.weights?.[m.id] ?? 1}×</span>
                      )}
                      {deltas[m.id] !== undefined && <DeltaBadge minor={deltas[m.id]} currency={expense.currency} />}
                      <AnimatedAmount minor={shares[m.id] ?? 0} currency={expense.currency} size="md" className="font-medium" />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {decided && decided.total > 0 && decided.decided < decided.total && (
              <p className="rounded-[12px] bg-canvas px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-2 text-pretty">
                {decided.total - decided.decided} of {decided.total} items are still shared by everyone.
                Tap the people who actually had something to make it exact.
              </p>
            )}

            {expense.rationale.length > 0 && (
              <div>
                <Label as="h2">Notes</Label>
                <ul className="mt-2 grid gap-1.5">
                  {expense.rationale.map((r, i) => (
                    <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-2 text-pretty">
                      <span aria-hidden="true" className="select-none text-ink-3">·</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-line pt-4">
              {confirmDelete ? (
                <div className="grid gap-2.5">
                  <p className="text-[13.5px] text-ink-2">Delete this expense? Everyone’s balance will change.</p>
                  <div className="flex gap-2.5">
                    <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
                    <Button variant="danger" onClick={remove}>Delete expense</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-[13.5px] font-semibold text-negative underline underline-offset-2"
                >
                  Delete this expense
                </button>
              )}
            </div>
          </div>
        ) : tab === 'discussion' ? (
          <Thread group={group} me={me} expenseId={expense.id} />
        ) : (
          <ExpenseHistory entries={history} group={group} currency={expense.currency} />
        )}
      </div>
    </Shell>
  )
}
