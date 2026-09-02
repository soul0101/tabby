'use client'
import { useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import type { Group } from '@/lib/types'
import { Tabs } from '@/components/Tabs'
import { ProposalCard } from '@/components/ProposalCard'
import { Thread } from '@/components/Thread'
import { ActivityTab } from '@/components/ActivityTab'
import { Card, EmptyState } from '@/components/ui'

type Sub = 'waiting' | 'discussion' | 'history'

/**
 * Everything that isn't the ledger itself: decisions still open, what people
 * are saying, and what already happened.
 *
 * Pending proposals used to sit as a block above every tab, which shouted at
 * you whether or not you were there to decide anything. They belong here, with
 * a count on the tab so you can still tell at a glance.
 */
export function ActivityPanel({ group, me }: { group: Group; me: string | null }) {
  const messages = useApp((s) => s.messages)
  const expenses = useApp((s) => s.expenses)
  const pending = useMemo(() => {
    // A draft against a deleted bill isn't a decision anyone can make, so it
    // leaves the queue with the bill — and comes back with it, since the
    // expense is only marked deleted rather than destroyed.
    const live = new Set(expenses.map((e) => e.id))
    return messages
      .filter((m) => m.groupId === group.id && m.kind === 'proposal' && m.status === 'pending')
      .filter((m) => !m.expenseId || live.has(m.expenseId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [messages, expenses, group.id])
  const [sub, setSub] = useState<Sub>(pending.length > 0 ? 'waiting' : 'history')

  return (
    <div className="grid gap-4">
      <Tabs
        size="sm"
        label="Activity views"
        value={sub}
        onChange={setSub}
        tabs={[
          { id: 'waiting', label: 'Waiting', badge: pending.length },
          { id: 'discussion', label: 'Discussion' },
          { id: 'history', label: 'History' },
        ]}
      />

      {sub === 'waiting' && (
        pending.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing to decide"
              body="When your agent suggests a change, it waits here until someone accepts or declines it."
            />
          </Card>
        ) : (
          <ul className="grid gap-2.5">
            {pending.map((m) => (
              <li key={m.id}>
                <ProposalCard message={m} group={group} me={me} showExpenseLink />
              </li>
            ))}
          </ul>
        )
      )}

      {sub === 'discussion' && <Thread group={group} me={me} expenseId={null} />}
      {sub === 'history' && <ActivityTab group={group} me={me} />}
    </div>
  )
}
