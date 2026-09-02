'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import type { Group, Message } from '@/lib/types'
import { Avatar, Button, Label } from '@/components/ui'
import { ProposalCard } from '@/components/ProposalCard'

const when = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/**
 * The conversation attached to an expense.
 *
 * This is where disagreements about money actually get settled, so it holds
 * both what people said and what was proposed — a rejected proposal stays
 * visible, because "we discussed this and said no" is worth keeping.
 */
export function Thread({
  group, me, expenseId,
}: { group: Group; me: string | null; expenseId: string | null }) {
  const all = useApp((s) => s.messages)
  const say = useApp((s) => s.say)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const thread = useMemo(
    () => all
      .filter((m) => m.groupId === group.id && m.expenseId === expenseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [all, group.id, expenseId],
  )
  const pending = thread.filter((m) => m.kind === 'proposal' && m.status === 'pending').length

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [thread.length])

  const send = async () => {
    const text = draft.trim()
    if (!text) return
    setBusy(true)
    setDraft('')
    try { await say(group.id, expenseId, text) } finally { setBusy(false) }
  }

  const nameOf = (id: string | null) =>
    !id ? 'Someone' : id === me ? 'You' : group.members.find((m) => m.id === id)?.name ?? 'Someone'

  return (
    <section aria-label="Conversation">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <Label as="h3">Discussion</Label>
        {pending > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ color: 'var(--color-agent)', background: 'var(--color-agent-wash)' }}>
            {pending} waiting on you
          </span>
        )}
      </div>

      {thread.length === 0 ? (
        <p className="rounded-[12px] bg-canvas px-3.5 py-3 text-[13px] leading-relaxed text-ink-3 text-pretty">
          Nothing here yet. Ask a question, or let your agent suggest a change — anything it proposes
          shows up here for everyone to see.
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {thread.map((m) => (
            <li key={m.id}>
              {m.kind === 'proposal'
                ? <ProposalCard message={m} group={group} me={me} />
                : <Bubble message={m} name={nameOf(m.authorMember)} group={group} mine={m.authorMember === me} />}
            </li>
          ))}
        </ul>
      )}
      <div ref={endRef} />

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder="Say something…"
          aria-label="Write a message"
          className="h-10 min-w-0 flex-1 rounded-[11px] border border-line bg-surface px-3.5 text-[14px] placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
        />
        <Button variant="primary" onClick={() => void send()} disabled={busy || !draft.trim()}>Send</Button>
      </div>
    </section>
  )
}

function Bubble({
  message, name, group, mine,
}: { message: Message; name: string; group: Group; mine: boolean }) {
  const person = group.members.find((m) => m.id === message.authorMember)
  if (message.kind === 'event') {
    return (
      <p className="px-1 text-[12.5px] text-ink-3">
        {message.body} · <span className="text-ink-3">{when(message.createdAt)}</span>
      </p>
    )
  }
  return (
    <div className="flex items-start gap-2.5">
      {person ? <Avatar person={person} size={28} /> : <span className="h-7 w-7 shrink-0 rounded-full bg-sunken" />}
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold">{mine ? 'You' : name}</span>
          <span className="text-[11.5px] text-ink-3">{when(message.createdAt)}</span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-pretty">{message.body}</p>
      </div>
    </div>
  )
}
