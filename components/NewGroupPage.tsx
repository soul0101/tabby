'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { PeoplePicker, emptyPicked, pickedCount, type Picked } from '@/components/PeoplePicker'
import { Shell } from '@/components/Shell'
import { ActionBar } from '@/components/ActionBar'
import { Button, Field, inputClass } from '@/components/ui'

const EMOJI = ['🌴', '🏠', '🎿', '🍛', '🎉', '🚀', '🏝', '🚗', '🎬', '🏕']

export function NewGroupPage() {
  const createGroup = useApp((s) => s.createGroup)
  const yourName = useApp((s) => s.yourName)
  const setYourName = useApp((s) => s.setYourName)
  const router = useRouter()
  // A seat is named once and everyone else sees it forever, so the placeholder
  // must not survive into a real group.
  const needsName = yourName === 'You'
  const [myName, setMyName] = useState('')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🌴')
  const [people, setPeople] = useState<Picked>(emptyPicked)
  const [error, setError] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (needsName && !myName.trim()) { setError('Your friends need to know which one is you.'); return }
    if (!name.trim()) { setError('Give the group a name so you can find it later.'); return }
    if (pickedCount(people) === 0) { setError('Add at least one person to split with.'); return }
    setBusy(true)
    try {
      if (needsName) await setYourName(myName.trim())
      const id = await createGroup(name.trim(), emoji, people)
      router.push(`/g/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t create the group.')
      setBusy(false)
    }
  }

  return (
    <Shell back={{ href: '/', label: 'Groups' }}
      title={<span className="text-[15px] font-semibold">New group</span>}>
      <p className="mb-5 text-[14px] leading-relaxed text-ink-2 text-pretty">
        Add the people you’re splitting with. They don’t need an account — you can send them the
        invite link later.
      </p>
      <div className="grid gap-4">
        {needsName && (
          <Field label="Your name" hint="So your friends can tell which expenses are yours." htmlFor="myname">
            <input
              id="myname" value={myName} data-autofocus autoComplete="name"
              onChange={(e) => { setMyName(e.target.value); setError(null) }}
              placeholder="Arjun" className={inputClass}
            />
          </Field>
        )}

        <Field label="Group name" htmlFor="gname">
          <div className="flex gap-2">
            <div className="flex items-center gap-1 overflow-x-auto rounded-[11px] border border-line px-1.5">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  aria-label={`Icon ${e}`}
                  aria-pressed={emoji === e}
                  className={`emoji grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[17px] transition-colors ${
                    emoji === e ? 'bg-sunken' : 'hover:bg-canvas'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <input
            id="gname"
            data-autofocus={!needsName || undefined}
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null) }}
            placeholder="Goa, August…"
            autoComplete="off"
            className={inputClass}
          />
        </Field>

        <Field
          label="Who’s splitting?"
          hint="You’re already in."
        >
          <PeoplePicker value={people} onChange={(v) => { setPeople(v); setError(null) }} />
        </Field>

      </div>

      <ActionBar error={error}>
        <Button className="flex-1" onClick={() => router.push('/')}>Cancel</Button>
        <Button className="flex-1" variant="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Creating…' : 'Create group'}
        </Button>
      </ActionBar>
    </Shell>
  )
}
