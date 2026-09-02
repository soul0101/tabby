'use client'
import { useMemo } from 'react'
import { computeShares, totalOf } from '@/lib/split'
import { CATEGORY_EMOJI, type Expense, type Group, type Settlement } from '@/lib/types'
import { Shell } from '@/components/Shell'
import { ActionBar } from '@/components/ActionBar'
import { Amount, Avatar, Button, Card, EmptyState, Label } from '@/components/ui'
import { useApp } from '@/lib/store'
import { seatOf } from '@/lib/me'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/**
 * What's actually between two people.
 *
 * The group balance says you're owed ₹29,000, which tells you nothing about
 * who to chase. This answers the question people actually ask.
 */
export function PersonPage({ groupId, personId }: { groupId: string; personId: string }) {
  const groups = useApp((s) => s.groups)
  const allExpenses = useApp((s) => s.expenses)
  const allSettlements = useApp((s) => s.settlements)
  const you = useApp((s) => s.you)
  const status = useApp((s) => s.status)
  const settle = useApp((s) => s.settle)
  const router = useRouter()

  const group = useMemo(() => groups.find((g) => g.id === groupId), [groups, groupId])
  const person = group?.members.find((m) => m.id === personId)
  const me = useMemo(() => (group ? seatOf(group, you) : null), [group, you])
  const expenses = useMemo(
    () => allExpenses.filter((e) => e.groupId === groupId), [allExpenses, groupId])
  const settlements = useMemo(
    () => allSettlements.filter((s) => s.groupId === groupId), [allSettlements, groupId])

  if (status === 'loading') {
    return (
      <Shell back={{ href: `/g/${groupId}`, label: 'Back' }}>
        <div className="h-40 animate-pulse rounded-[16px] bg-sunken" />
      </Shell>
    )
  }
  if (!group || !person) {
    return (
      <Shell back={{ href: `/g/${groupId}`, label: 'Back' }}>
        <Card><EmptyState title="Person not found" body="They may have been removed from the group." /></Card>
      </Shell>
    )
  }

  return (
    <PersonView
      person={person} group={group} expenses={expenses} settlements={settlements} me={me}
      onSettle={(amountMinor, from, to) => { void settle(group.id, { from, to, amountMinor }) }}
      onDone={() => router.push(`/g/${groupId}`)}
    />
  )
}

function PersonView({
  person, group, expenses, settlements, me, onSettle, onDone,
}: {
  person: Group['members'][number]
  group: Group
  expenses: Expense[]
  settlements: Settlement[]
  me: string | null
  onSettle: (amountMinor: number, from: string, to: string) => void
  onDone: () => void
}) {
  const { net, lines } = useMemo(() => {
    if (!me) return { net: 0, lines: [] as { e: Expense; delta: number }[] }
    let n = 0
    const rows: { e: Expense; delta: number }[] = []

    for (const e of expenses) {
      const shares = computeShares(e)
      const yours = shares[me] ?? 0
      const theirs = shares[person.id] ?? 0
      let delta = 0
      // You paid, so they owe you their share.
      if (e.payerId === me && theirs > 0) delta += theirs
      // They paid, so you owe them yours.
      if (e.payerId === person.id && yours > 0) delta -= yours
      if (delta !== 0) { rows.push({ e, delta }); n += delta }
    }

    for (const s of settlements) {
      if (s.from === person.id && s.to === me) n -= s.amountMinor
      if (s.from === me && s.to === person.id) n += s.amountMinor
    }
    return { net: n, lines: rows.sort((a, b) => b.e.occurredAt.localeCompare(a.e.occurredAt)) }
  }, [expenses, settlements, me, person.id])

  const theyOweYou = net > 0

  return (
    <Shell back={{ href: `/g/${group.id}`, label: group.name }}
      title={<span className="text-[15px] font-semibold">You and {person.name}</span>}>
      <div className="grid gap-5">
        <div className="grid justify-items-center gap-2 py-2">
          <Avatar person={person} size={56} />
          {net === 0 ? (
            <p className="text-[15px] text-ink-2">You’re all square.</p>
          ) : (
            <>
              <Amount minor={Math.abs(net)} currency={group.currency} size="hero"
                tone={theyOweYou ? 'positive' : 'negative'} />
              <p className="text-[14px] text-ink-2">
                {theyOweYou ? `${person.name} owes you` : `you owe ${person.name}`}
              </p>
            </>
          )}
        </div>

        {lines.length === 0 ? (
          <EmptyState title="Nothing shared yet" body={`No expenses involve both you and ${person.name}.`} />
        ) : (
          <div>
            <Label className="mb-2">{lines.length} shared {lines.length === 1 ? 'expense' : 'expenses'}</Label>
            <ul className="grid gap-1">
              {lines.map(({ e, delta }) => (
                <li key={e.id}>
                  <Link href={`/g/${group.id}/e/${e.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-[11px] px-2 py-2 transition-colors hover:bg-canvas">
                  <span aria-hidden="true" className="emoji grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-sunken text-[15px]">
                    {CATEGORY_EMOJI[e.category]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{e.description}</span>
                    <span className="text-[12.5px] text-ink-3">
                      {new Date(e.occurredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {' · total '}
                      <Amount minor={totalOf(e)} currency={e.currency} size="sm" className="text-ink-3" />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Amount minor={Math.abs(delta)} currency={group.currency} size="sm"
                      tone={delta > 0 ? 'positive' : 'negative'} className="font-semibold" />
                    <span className="block text-[11.5px] text-ink-3">
                      {delta > 0 ? 'owes you' : 'you owe'}
                    </span>
                  </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {net !== 0 && (
        <ActionBar>
          <Button className="flex-1" onClick={onDone}>Back</Button>
          <Button
            className="flex-1" variant="primary"
            onClick={() => {
              onSettle(Math.abs(net), theyOweYou ? person.id : me!, theyOweYou ? me! : person.id)
              onDone()
            }}
          >
            Settle {theyOweYou ? 'up' : `with ${person.name}`}
          </Button>
        </ActionBar>
      )}
    </Shell>
  )
}
