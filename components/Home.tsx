'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/store'
import { netBalances } from '@/lib/settle'
import { seatOf } from '@/lib/me'
import { computeShares } from '@/lib/split'
import { formatMinor } from '@/lib/money'
import { Amount, AvatarStack, Button, Card, EmptyState, Label, SplitBar } from '@/components/ui'
import { InviteInbox } from '@/components/InviteInbox'
import { Shell } from '@/components/Shell'
import { ScenarioPicker } from '@/components/ScenarioPicker'
import { Avatar } from '@/components/ui'

export function Home() {

  const groups = useApp((s) => s.groups)
  const expenses = useApp((s) => s.expenses)
  const settlements = useApp((s) => s.settlements)
  const you = useApp((s) => s.you)
  const yourName = useApp((s) => s.yourName)
  const status = useApp((s) => s.status)
  const error = useApp((s) => s.error)

  const rows = useMemo(() => groups.map((g) => {
    const es = expenses.filter((e) => e.groupId === g.id)
    const ss = settlements.filter((s) => s.groupId === g.id)
    const net = netBalances(es, ss)
    const spend: Record<string, number> = {}
    for (const e of es) {
      for (const [id, v] of Object.entries(computeShares(e))) spend[id] = (spend[id] ?? 0) + v
    }
    const me = seatOf(g, you)
    return { group: g, yours: me ? net[me] ?? 0 : 0, spend, count: es.length }
  }), [groups, expenses, settlements, you])

  const overall = rows.reduce((s, r) => s + r.yours, 0)

  if (status === 'loading') {
    return (
      <Shell>
        <div className="grid gap-3">
          <div className="h-12 w-56 animate-pulse rounded-[10px] bg-sunken" />
          <div className="h-24 animate-pulse rounded-[16px] bg-sunken" />
          <div className="h-24 animate-pulse rounded-[16px] bg-sunken" />
        </div>
      </Shell>
    )
  }

  if (status === 'error') {
    return (
      <Shell>
        <Card>
          <EmptyState
            title="Couldn’t load your groups"
            body={error ?? 'Something went wrong talking to the server.'}
            action={<Button variant="primary" onClick={() => window.location.reload()}>Try again</Button>}
          />
        </Card>
      </Shell>
    )
  }

  return (
    <Shell
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/new"
            className="inline-flex h-8 items-center rounded-[9px] bg-ink px-3 text-[13px] font-semibold text-surface transition-colors hover:bg-ink/90"
          >
            New group
          </Link>
          <Link href="/you" aria-label="Your account" className="rounded-full transition-transform hover:scale-105">
            <Avatar person={{ id: 'you', name: yourName, hue: 25 }} size={32} />
          </Link>
        </div>
      }
    >
      <section className="mb-8">
        <Label>{overall > 0 ? 'You’re owed overall' : overall < 0 ? 'You owe overall' : 'Overall'}</Label>
        <div className="mt-1.5">
          <Amount
            minor={Math.abs(overall)}
            size="hero"
            tone={overall > 0 ? 'positive' : overall < 0 ? 'negative' : 'muted'}
          />
        </div>
        <p className="mt-1.5 text-[14px] text-ink-2">
          {overall === 0
            ? 'Everything’s settled. Nice.'
            : `across ${rows.length} ${rows.length === 1 ? 'group' : 'groups'}`}
        </p>
      </section>

      {yourName === 'You' && rows.length > 0 && (
        <Link
          href="/you"
          className="mb-4 flex w-full items-center gap-3 rounded-[13px] border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-canvas"
        >
          <span aria-hidden="true" className="emoji text-[17px]">👋</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Add your name</span>
            <span className="block text-[13px] text-ink-2">So your friends know which expenses are yours.</span>
          </span>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-ink-3">
            <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}

      {rows.length > 0 && (
        <Link
          href="/try"
          className="mb-4 flex items-center gap-3 rounded-[13px] border border-dashed border-line-2 px-4 py-3 text-left transition-colors hover:bg-surface"
        >
          <span aria-hidden="true" className="emoji text-[17px]">🧪</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Try another scenario</span>
            <span className="block text-[13px] text-ink-2">
              A flat share, a trip in yen, or a group that’s nearly settled.
            </span>
          </span>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-ink-3">
            <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}

      <InviteInbox />

      {rows.length === 0 ? (
        <div className="grid gap-6">
          <Card>
            <EmptyState
              title="No groups yet"
              body="Make one for a trip, a flat, or a night out. The people you add don’t need an account."
              action={
                <Link
                  href="/new"
                  className="inline-flex h-10 items-center rounded-[11px] bg-ink px-4 text-[14px] font-semibold text-surface transition-colors hover:bg-ink/90"
                >
                  Create your first group
                </Link>
              }
            />
          </Card>

          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[12.5px] text-ink-3">or look around first</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <ScenarioPicker />
          </div>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map(({ group, yours, spend, count }) => (
            <li key={group.id}>
              <Card as={Link} href={`/g/${group.id}`} className="lift block p-4 sm:p-5">
                <div className="flex items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className="emoji grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-sunken text-[20px]"
                  >
                    {group.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[16px] font-semibold tracking-[-0.01em]">{group.name}</h2>
                    <p className="mt-0.5 text-[13.5px] text-ink-2">
                      {count} {count === 1 ? 'expense' : 'expenses'} · {group.members.length} people
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {yours === 0 ? (
                      <span className="text-[13.5px] font-medium text-ink-3">settled up</span>
                    ) : (
                      <>
                        <Amount minor={Math.abs(yours)} size="md" tone={yours > 0 ? 'positive' : 'negative'} className="font-semibold" />
                        <p className="text-[12.5px] text-ink-3">{yours > 0 ? 'you’re owed' : 'you owe'}</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3.5 flex items-center gap-3">
                  <SplitBar shares={spend} people={group.members} className="flex-1" currency={group.currency} />
                  <AvatarStack people={group.members} size={24} max={4} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

    </Shell>
  )
}
