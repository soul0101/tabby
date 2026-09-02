'use client'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { netBalances } from '@/lib/settle'
import { seatOf } from '@/lib/me'
import { computeShares } from '@/lib/split'
import { AnimatedAmount, AvatarStack, Button, Card, EmptyState, Label, SplitBar, inputClass } from '@/components/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { Tabs } from '@/components/Tabs'
import { ExpenseRow } from '@/components/ExpenseRow'
import { BalancesTab } from '@/components/BalancesTab'
import { Insights } from '@/components/Insights'
import { ActivityPanel } from '@/components/ActivityPanel'
import { RecurringSection } from '@/components/RecurringSection'


export function GroupScreen({ groupId }: { groupId: string }) {
  const [query, setQuery] = useState('')
  const router = useRouter()

  // Selectors must return stable references — deriving inside one would make
  // zustand see a new array every render and loop forever.
  const allGroups = useApp((s) => s.groups)
  const allExpenses = useApp((s) => s.expenses)
  const allSettlements = useApp((s) => s.settlements)
  const you = useApp((s) => s.you)
  const status = useApp((s) => s.status)
  const setOpenGroup = useApp((s) => s.setOpenGroup)
  // The visible tab lives in the store so an agent can steer it. Mirroring it
  // into local state took two effects that wrote to each other, and each read
  // the other's pre-update value — so they oscillated instead of settling.
  const tab = useApp((s) => s.openView)
  const setTab = useApp((s) => s.setOpenView)

  // Publish what's on screen so the tool layer inherits the user's context.
  useEffect(() => {
    setOpenGroup(groupId)
    return () => setOpenGroup(null)
  }, [groupId, setOpenGroup])

  const group = useMemo(() => allGroups.find((g) => g.id === groupId), [allGroups, groupId])
  const expenses = useMemo(() => allExpenses.filter((e) => e.groupId === groupId), [allExpenses, groupId])
  const settlements = useMemo(
    () => allSettlements.filter((s) => s.groupId === groupId), [allSettlements, groupId],
  )

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = q
      ? expenses.filter((e) =>
          e.description.toLowerCase().includes(q)
          || e.category.includes(q)
          || group?.members.find((m) => m.id === e.payerId)?.name.toLowerCase().includes(q))
      : expenses
    return [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  }, [expenses, query, group])
  const me = useMemo(() => (group ? seatOf(group, you) : null), [group, you])
  const yourNet = useMemo(
    () => (me ? netBalances(expenses, settlements)[me] ?? 0 : 0),
    [expenses, settlements, me],
  )
  const allMessages = useApp((s) => s.messages)
  const pendingProposals = useMemo(
    () => allMessages.filter(
      (m) => m.groupId === groupId && m.kind === 'proposal' && m.status === 'pending',
    ),
    [allMessages, groupId],
  )

  const spend = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const e of expenses) {
      for (const [id, v] of Object.entries(computeShares(e))) acc[id] = (acc[id] ?? 0) + v
    }
    return acc
  }, [expenses])

  if (status === 'loading') {
    return (
      <Shell back={{ href: '/', label: 'Groups' }}>
        <div className="grid gap-3">
          <div className="h-12 w-48 animate-pulse rounded-[10px] bg-sunken" />
          <div className="h-10 animate-pulse rounded-[12px] bg-sunken" />
          <div className="h-16 animate-pulse rounded-[13px] bg-sunken" />
          <div className="h-16 animate-pulse rounded-[13px] bg-sunken" />
        </div>
      </Shell>
    )
  }

  if (!group) {
    return (
      <Shell back={{ href: '/', label: 'Groups' }}>
        <Card><EmptyState title="Group not found" body="It may have been deleted, or the link is wrong." /></Card>
      </Shell>
    )
  }

  return (
    <Shell
      back={{ href: '/', label: 'Groups' }}
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="emoji">{group.emoji}</span>
          <span className="truncate text-[15px] font-semibold">{group.name}</span>
        </span>
      }
      action={
        <Link
          href={`/g/${groupId}/settings`}
          className="rounded-full p-0.5 transition-transform hover:scale-105"
          aria-label={`Group settings — ${group.members.length} people`}
        >
          <AvatarStack people={group.members} size={26} max={3} />
        </Link>
      }
    >
      <section className="mb-6">
        <Label>{yourNet > 0 ? 'You’re owed' : yourNet < 0 ? 'You owe' : 'Your balance'}</Label>
        <div className="mt-1.5">
          <AnimatedAmount minor={Math.abs(yourNet)} currency={group.currency} size="hero"
            tone={yourNet > 0 ? 'positive' : yourNet < 0 ? 'negative' : 'muted'} />
        </div>
        <div className="mt-3.5 flex items-center gap-3">
          <SplitBar shares={spend} people={group.members} currency={group.currency} className="flex-1" />
          <span className="shrink-0 text-[12.5px] text-ink-3">
            {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
          </span>
        </div>
      </section>


      <div className="mb-4">
        <Tabs
          label="Group views"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'expenses', label: 'Expenses' },
            { id: 'balances', label: 'Balances' },
            { id: 'insights', label: 'Insights' },
            { id: 'activity', label: 'Activity', badge: pendingProposals.length },
          ]}
        />
      </div>

      {tab === 'balances' ? (
        <BalancesTab group={group} me={me} />
      ) : tab === 'insights' ? (
        <Insights group={group} expenses={expenses} me={me} />
      ) : tab === 'activity' ? (
        <ActivityPanel group={group} me={me} />
      ) : expenses.length === 0 ? (
        <Card>
          <EmptyState
            title="No expenses yet"
            body="Add the first one — a dinner, a taxi, the villa deposit. You can snap the receipt and split it line by line."
            action={<Button variant="primary" onClick={() => router.push(`/g/${groupId}/new`)}>Add an expense</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="mb-3"><RecurringSection group={group} me={me} /></div>
          {expenses.length > 5 && (
            <div className="relative mb-2">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search expenses…" aria-label="Search expenses" type="search"
                className={`${inputClass} h-10 pl-9`}
              />
            </div>
          )}
          {sorted.length === 0 ? (
            <Card>
              <EmptyState title="Nothing matches" body={`No expenses match “${query}”. Try a different word, or a person's name.`} />
            </Card>
          ) : (
            <ul className="-mx-3 grid">
              {sorted.map((e) => (
                <li key={e.id}>
                  <ExpenseRow expense={e} group={group} me={me} href={`/g/${groupId}/e/${e.id}`} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'expenses' && (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Link
          href={`/g/${groupId}/new`}
          className="pointer-events-auto inline-flex h-12 items-center justify-center gap-2 rounded-[13px] bg-ink px-5 text-[15px] font-semibold text-surface shadow-pop transition-transform active:scale-[0.98]"
        >
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          Add expense
        </Link>
      </div>
      )}

    </Shell>
  )
}
