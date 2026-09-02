'use client'
import { useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import { todayISO } from '@/components/DateField'
import type { Group } from '@/lib/types'
import { Amount, Button, Card, Label } from '@/components/ui'
import { toast } from '@/components/Toast'

/**
 * Repeating expenses — rent, the wifi bill.
 *
 * Nothing is created behind your back: a due template surfaces here and you
 * confirm it. An app that silently invents charges against your friends is an
 * app people stop trusting.
 */
export function RecurringSection({ group, me }: { group: Group; me: string | null }) {
  const recurring = useApp((s) => s.recurring)
  const materialise = useApp((s) => s.materialise)
  const stopRecurring = useApp((s) => s.stopRecurring)
  const [busy, setBusy] = useState<string | null>(null)

  const mine = useMemo(
    () => recurring.filter((r) => r.groupId === group.id).sort((a, b) => a.nextDue.localeCompare(b.nextDue)),
    [recurring, group.id],
  )
  if (mine.length === 0) return null

  const today = todayISO()
  const due = mine.filter((r) => r.nextDue <= today)
  const upcoming = mine.filter((r) => r.nextDue > today)
  const nameOf = (id: string) => (id === me ? 'You' : group.members.find((m) => m.id === id)?.name ?? '')

  return (
    <div className="grid gap-3">
      {due.map((r) => (
        <Card key={r.id} className="border-ink/15 p-4" style={{ background: 'var(--color-warn-wash)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold">{r.description} is due</span>
              <span className="text-[13px] text-ink-2">
                <Amount minor={r.totalMinor} currency={r.currency} size="sm" className="text-ink-2" />
                {' · '}{nameOf(r.payerId)} pays{' · '}{r.cadence}
              </span>
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { void stopRecurring(r.id); toast('Stopped repeating') }}>
                Stop
              </Button>
              <Button
                size="sm" variant="primary" disabled={busy === r.id}
                onClick={async () => {
                  setBusy(r.id)
                  await materialise(r.id)
                  toast(`Added ${r.description}`, { tone: 'success' })
                  setBusy(null)
                }}
              >
                {busy === r.id ? 'Adding…' : 'Add it'}
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {upcoming.length > 0 && (
        <Card className="p-4">
          <Label>Repeating</Label>
          <ul className="mt-2.5 grid gap-2">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{r.description}</span>
                  <span className="text-[12.5px] text-ink-3">
                    next on {new Date(`${r.nextDue}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {' · '}{r.cadence}
                  </span>
                </span>
                <Amount minor={r.totalMinor} currency={r.currency} size="sm" className="text-ink-2" />
                <Button size="sm" variant="ghost" onClick={() => { void stopRecurring(r.id); toast('Stopped repeating') }}>
                  Stop
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
