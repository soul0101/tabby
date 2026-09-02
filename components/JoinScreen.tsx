'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import * as repo from '@/lib/repo'
import { hueFor } from '@/lib/palette'
import { Avatar, Button, Card, EmptyState } from '@/components/ui'
import { Shell } from '@/components/Shell'
import { toast } from '@/components/Toast'

/**
 * Claiming a seat from an invite link.
 *
 * The friend was already added by name, so the useful question isn't "what's
 * your name" — it's "which of these is you".
 */
export function JoinScreen({ token }: { token: string }) {
  const [peek, setPeek] = useState<repo.InvitePeek | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useApp((s) => s.load)
  const you = useApp((s) => s.you)
  const yourName = useApp((s) => s.yourName)
  const router = useRouter()

  useEffect(() => {
    repo.peekInvite(token)
      .then(setPeek)
      .catch((e: Error) => setError(e.message))
  }, [token])

  const join = async (memberId?: string | null) => {
    setBusy(true)
    try {
      const groupId = await repo.joinGroup(token, memberId)
      if (you) await load(you, yourName)
      toast('You’re in', { tone: 'success' })
      router.push(`/g/${groupId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t join that group.')
      setBusy(false)
    }
  }

  if (error) {
    return (
      <Shell back={{ href: '/', label: 'Groups' }}>
        <Card><EmptyState title="This invite didn’t work" body={error}
          action={<Button variant="primary" onClick={() => router.push('/')}>Go to your groups</Button>} /></Card>
      </Shell>
    )
  }

  if (!peek) {
    return (
      <Shell back={{ href: '/', label: 'Groups' }}>
        <div className="grid gap-3">
          <div className="h-14 w-56 animate-pulse rounded-[12px] bg-sunken" />
          <div className="h-32 animate-pulse rounded-[16px] bg-sunken" />
        </div>
      </Shell>
    )
  }

  if (!peek.ok) {
    return (
      <Shell back={{ href: '/', label: 'Groups' }}>
        <Card><EmptyState title="Invite not found"
          body="That link may have been mistyped, or the group was deleted."
          action={<Button variant="primary" onClick={() => router.push('/')}>Go to your groups</Button>} /></Card>
      </Shell>
    )
  }

  if (peek.alreadyMember) {
    return (
      <Shell back={{ href: '/', label: 'Groups' }}>
        <Card>
          <EmptyState
            title={`You're already in ${peek.name}`}
            body="Nothing to do here."
            action={<Button variant="primary" onClick={() => router.push(`/g/${peek.groupId}`)}>Open the group</Button>}
          />
        </Card>
      </Shell>
    )
  }

  const seats = peek.seats ?? []

  return (
    <Shell back={{ href: '/', label: 'Groups' }}>
      <div className="mx-auto max-w-md">
        <div className="mb-6 grid justify-items-center gap-2 text-center">
          <span aria-hidden="true" className="emoji grid h-16 w-16 place-items-center rounded-[20px] bg-sunken text-[28px]">
            {peek.emoji}
          </span>
          <h1 className="font-display text-[26px] font-bold tracking-[-0.03em]">{peek.name}</h1>
          <p className="text-[14.5px] text-ink-2 text-pretty">
            {seats.length > 0
              ? 'Someone already added you by name. Which one are you?'
              : 'You’ve been invited to split expenses in this group.'}
          </p>
        </div>

        {seats.length > 0 && (
          <ul className="grid gap-2">
            {seats.map((seat, i) => (
              <li key={seat.id}>
                <button
                  onClick={() => void join(seat.id)}
                  disabled={busy}
                  className="card lift flex w-full items-center gap-3 p-4 text-left disabled:opacity-50"
                >
                  <Avatar person={{ id: seat.id, name: seat.name, hue: hueFor(i + 1) }} size={38} />
                  <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold">{seat.name}</span>
                  <span className="shrink-0 text-[13.5px] font-semibold text-ink-2">That’s me</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-2">
          <Button size="lg" variant={seats.length > 0 ? 'secondary' : 'primary'}
            onClick={() => void join(null)} disabled={busy}>
            {busy ? 'Joining…' : seats.length > 0 ? 'None of these — add me' : 'Join this group'}
          </Button>
        </div>
      </div>
    </Shell>
  )
}
