'use client'
import { useState } from 'react'
import { useApp } from '@/lib/store'
import { Button, Label, inputClass } from '@/components/ui'

export interface Picked {
  friendIds: string[]
  emails: string[]
  names: string[]
}

export const emptyPicked: Picked = { friendIds: [], emails: [], names: [] }

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/**
 * Choosing who you're splitting with.
 *
 * Ordered by how the answer usually arrives: the people you've split with
 * before are right there, then an address for someone new. Typing a bare name
 * still works — some people genuinely aren't going to install anything — but
 * it isn't the default any more, because if you have somebody's email there is
 * no reason to type their name and then chase them separately.
 */
export function PeoplePicker({
  value, onChange, exclude = [],
}: {
  value: Picked
  onChange: (v: Picked) => void
  /** User ids already in the group, so they aren't offered twice. */
  exclude?: string[]
}) {
  const friends = useApp((s) => s.friends)
  const [entry, setEntry] = useState('')
  const [error, setError] = useState<string | null>(null)

  const available = friends.filter((f) => !exclude.includes(f.id))
  const toggle = (id: string) => onChange({
    ...value,
    friendIds: value.friendIds.includes(id)
      ? value.friendIds.filter((x) => x !== id)
      : [...value.friendIds, id],
  })

  const add = () => {
    const text = entry.trim()
    if (!text) return
    if (looksLikeEmail(text)) {
      const email = text.toLowerCase()
      const known = friends.find((f) => f.email.toLowerCase() === email)
      if (known) { toggle(known.id); setEntry(''); setError(null); return }
      if (value.emails.includes(email)) { setError('You’ve already added that address.'); return }
      onChange({ ...value, emails: [...value.emails, email] })
    } else {
      if (value.names.some((n) => n.toLowerCase() === text.toLowerCase())) {
        setError(`${text} is already on the list.`); return
      }
      onChange({ ...value, names: [...value.names, text] })
    }
    setEntry(''); setError(null)
  }

  return (
    <div className="grid gap-3">
      {available.length > 0 && (
        <div>
          <Label className="mb-2">Your people</Label>
          <div className="flex flex-wrap gap-2">
            {available.map((f) => {
              const on = value.friendIds.includes(f.id)
              return (
                <button
                  key={f.id}
                  onClick={() => toggle(f.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[14px] font-semibold transition-colors ${
                    on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:border-line-2'
                  }`}
                >
                  {on && <span aria-hidden="true">✓</span>}
                  {f.name}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[13px] text-ink-3">
            You’ve split with these people before — they go straight in.
          </p>
        </div>
      )}

      <div>
        <Label className="mb-2">
          {available.length > 0 ? 'Someone else' : 'Who’s splitting?'}
        </Label>
        <div className="flex gap-2">
          <input
            id="addperson"
            value={entry}
            onChange={(e) => { setEntry(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="their@email.com"
            aria-label="Email address, or a name"
            autoComplete="off"
            className={inputClass}
          />
          <Button onClick={add} disabled={!entry.trim()}>Add</Button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3 text-pretty">
          An email invites them, and they choose whether to join. No email? Type a name instead —
          they’ll owe money straight away and can claim their spot later from the share link.
        </p>
        {error && <p className="mt-2 text-[13px] font-semibold text-negative">{error}</p>}
      </div>

      {(value.emails.length > 0 || value.names.length > 0) && (
        <ul className="grid gap-1.5">
          {value.emails.map((e) => (
            <li key={e} className="flex items-center justify-between gap-3 text-[14px]">
              <span className="min-w-0 truncate">{e} <span className="text-ink-3">· will be invited</span></span>
              <Button size="sm" variant="ghost" aria-label={`Remove ${e}`}
                onClick={() => onChange({ ...value, emails: value.emails.filter((x) => x !== e) })}>✕</Button>
            </li>
          ))}
          {value.names.map((n) => (
            <li key={n} className="flex items-center justify-between gap-3 text-[14px]">
              <span className="min-w-0 truncate">{n} <span className="text-ink-3">· no account</span></span>
              <Button size="sm" variant="ghost" aria-label={`Remove ${n}`}
                onClick={() => onChange({ ...value, names: value.names.filter((x) => x !== n) })}>✕</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const pickedCount = (v: Picked) => v.friendIds.length + v.emails.length + v.names.length
