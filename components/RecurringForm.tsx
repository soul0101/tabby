'use client'
import { useState } from 'react'
import { useApp } from '@/lib/store'
import { toMinor } from '@/lib/money'
import { CATEGORIES, CATEGORY_EMOJI, type Cadence, type Category, type Group } from '@/lib/types'
import { PersonPicker } from '@/components/PersonPicker'
import { DateField, todayISO } from '@/components/DateField'
import { Avatar, Button, Field, Label, inputClass } from '@/components/ui'
import { toast } from '@/components/Toast'

export function RecurringForm({
  group, me, onClose,
}: { group: Group; me: string | null; onClose: () => void }) {
  const addRecurring = useApp((s) => s.addRecurring)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [payerId, setPayerId] = useState(me ?? group.members[0]?.id ?? '')
  const [category, setCategory] = useState<Category>('stay')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [nextDue, setNextDue] = useState(todayISO())
  const [participants, setParticipants] = useState(group.members.map((m) => m.id))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!description.trim()) return setError('What repeats?')
    const totalMinor = toMinor(parseFloat(amount) || 0)
    if (totalMinor <= 0) return setError('Enter an amount greater than zero.')
    if (participants.length === 0) return setError('Pick who it’s split between.')

    setBusy(true)
    try {
      await addRecurring({
        groupId: group.id, description: description.trim(), category, payerId,
        totalMinor, currency: group.currency, participants,
        splitMode: 'equal', weights: {}, cadence, nextDue,
      })
      toast('Repeating expense saved', { tone: 'success' })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save that.')
      setBusy(false)
    }
  }

  return (
    <section className="rounded-[13px] border border-line bg-surface p-4" aria-label="New repeating expense">
      <p className="mb-4 text-[13px] leading-relaxed text-ink-3 text-pretty">
        Tabby surfaces it when it’s due. You confirm before anything is added.
      </p>
      <div className="grid gap-4">
        <Field label="What repeats?" htmlFor="rdesc">
          <input id="rdesc" value={description} data-autofocus autoComplete="off"
            onChange={(e) => { setDescription(e.target.value); setError(null) }}
            placeholder="Rent" className={inputClass} />
        </Field>

        <Field label="Amount" htmlFor="ramt">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-ink-3">₹</span>
            <input id="ramt" value={amount} inputMode="decimal" autoComplete="off"
              onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '')); setError(null) }}
              placeholder="0.00" className={`${inputClass} tnum pl-7`} />
          </div>
        </Field>

        <Field label="How often">
          <div className="flex gap-1 rounded-[12px] bg-sunken p-1">
            {(['monthly', 'weekly'] as Cadence[]).map((c) => (
              <button key={c} type="button" onClick={() => setCadence(c)} aria-pressed={cadence === c}
                className={`h-9 flex-1 rounded-[9px] text-[13.5px] font-semibold capitalize transition-all ${
                  cadence === c ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </Field>

        <Field label="First one due">
          <DateField value={nextDue} onChange={setNextDue} />
        </Field>

        <Field label="Category">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                aria-label={c}
                className={`emoji grid h-9 w-9 place-items-center rounded-full border text-[15px] transition-all ${
                  category === c ? 'border-ink bg-ink scale-105' : 'border-line hover:border-line-2'
                }`}>
                {CATEGORY_EMOJI[c]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Who pays">
          <div className="flex flex-wrap gap-1.5">
            {group.members.map((m) => (
              <button key={m.id} type="button" onClick={() => setPayerId(m.id)} aria-pressed={payerId === m.id}
                className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition-colors ${
                  payerId === m.id ? 'border-ink bg-ink text-surface' : 'border-line text-ink-2 hover:border-line-2'
                }`}>
                <Avatar person={m} size={26} muted={payerId !== m.id} />
                <span className="text-[13.5px] font-medium">{m.id === me ? 'You' : m.name}</span>
              </button>
            ))}
          </div>
        </Field>

        <div>
          <Label className="mb-2">Split between</Label>
          <PersonPicker people={group.members} selected={participants} youId={me ?? undefined}
            onToggle={(id) => setParticipants((p) =>
              p.includes(id) ? p.filter((x) => x !== id) : [...p, id])} />
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-[13.5px] text-negative">{error}</p>}
      <div className="mt-4 flex gap-2.5">
        <Button className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" variant="primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </section>
  )
}
