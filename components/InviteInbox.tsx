'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { Button, Card, Label } from '@/components/ui'
import { toast } from '@/components/Toast'

/**
 * Invitations waiting on you, wherever you are in the app.
 *
 * This is the half of "invite by email" that makes it a real thing rather than
 * a mailing list: being added to somebody's ledger is a decision, so it needs a
 * place to be accepted or turned down.
 */
export function InviteInbox() {
  const invites = useApp((s) => s.invites)
  const loadInvites = useApp((s) => s.loadInvites)
  const answerInvite = useApp((s) => s.answerInvite)
  const signedIn = useApp((s) => s.signedIn)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { void loadInvites() }, [loadInvites, signedIn])

  if (invites.length === 0) return null

  const answer = async (id: string, name: string, accept: boolean) => {
    setBusy(id)
    try {
      await answerInvite(id, accept)
      toast(accept ? `You’re in — ${name}` : `Declined ${name}`,
        { tone: accept ? 'success' : undefined })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That didn’t work')
    } finally { setBusy(null) }
  }

  return (
    <Card className="mb-4 p-4 sm:p-5" style={{ borderColor: 'var(--color-line-2)' }}>
      <Label as="h2">
        {invites.length === 1 ? 'An invitation' : `${invites.length} invitations`}
      </Label>
      <ul className="mt-3 grid gap-2.5">
        {invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0 text-[14.5px]">
              <strong className="font-semibold">{i.invitedByName ?? 'Someone'}</strong>
              {' invited you to '}
              <strong className="font-semibold">{i.groupName}</strong>
              {i.memberName && (
                <span className="block text-[13px] text-ink-2">as {i.memberName}</span>
              )}
            </span>
            <span className="flex shrink-0 gap-2">
              <Button size="sm" variant="ghost" disabled={busy === i.id}
                onClick={() => void answer(i.id, i.groupName, false)}>
                Decline
              </Button>
              <Button size="sm" disabled={busy === i.id}
                onClick={() => void answer(i.id, i.groupName, true)}>
                {busy === i.id ? 'Joining…' : 'Join'}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
