'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { SCENARIOS, type Scenario } from '@/lib/scenarios'
import { hueFor } from '@/lib/palette'
import { Avatar, Button, Label } from '@/components/ui'
import { toast } from '@/components/Toast'

/**
 * Pick a situation, then pick who you are in it.
 *
 * The second half matters more than the first: an argument about who pays for
 * the prawns reads completely differently depending on whether you're the one
 * eating them.
 */
export function ScenarioPicker({ onDone }: { onDone?: () => void }) {
  const loadScenario = useApp((s) => s.loadScenario)
  const [chosen, setChosen] = useState<Scenario | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const router = useRouter()

  const start = async (scenario: Scenario, you: string) => {
    setBusy(you)
    try {
      const id = await loadScenario(scenario.id, you)
      toast(`You’re ${you} in ${scenario.title}`, { tone: 'success' })
      onDone?.()
      router.push(`/g/${id}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t set that up', { tone: 'error' })
      setBusy(null)
    }
  }

  if (chosen) {
    const rest = chosen.cast.filter((n) => !chosen.perspectives.some((p) => p.name === n))
    return (
      <div>
        <button
          onClick={() => setChosen(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-2 hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12.5 5.5 8 10 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All scenarios
        </button>

        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em]">
          <span aria-hidden="true" className="emoji mr-1.5">{chosen.emoji}</span>
          {chosen.title}
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2 text-pretty">{chosen.blurb}</p>

        <Label className="mb-2 mt-5">Who are you?</Label>
        <ul className="grid gap-2">
          {chosen.perspectives.map((p) => (
            <li key={p.name}>
              <button
                onClick={() => void start(chosen, p.name)}
                disabled={busy !== null}
                className="card lift flex w-full items-center gap-3 p-4 text-left disabled:opacity-50"
              >
                <Avatar
                  person={{ id: p.name, name: p.name, hue: hueFor(chosen.cast.indexOf(p.name)) }}
                  size={40}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-semibold">{p.name}</span>
                  <span className="block text-[13px] text-ink-2 text-pretty">{p.hint}</span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-ink-2">
                  {busy === p.name ? 'Setting up…' : 'Be them'}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {rest.length > 0 && (
          <div className="mt-4">
            <Label className="mb-2">Or someone else in the group</Label>
            <div className="flex flex-wrap gap-1.5">
              {rest.map((n) => (
                <Button key={n} size="sm" disabled={busy !== null} onClick={() => void start(chosen, n)}>
                  {busy === n ? 'Setting up…' : n}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <Label className="mb-2">Try it on a real situation</Label>
      <ul className="grid gap-2.5">
        {SCENARIOS.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => setChosen(s)}
              className="card lift flex w-full items-start gap-3.5 p-4 text-left"
            >
              <span aria-hidden="true" className="emoji grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-sunken text-[20px]">
                {s.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-semibold tracking-[-0.01em]">{s.title}</span>
                <span className="mt-0.5 block text-[13.5px] leading-relaxed text-ink-2 text-pretty">
                  {s.blurb}
                </span>
                <span className="mt-1.5 inline-block rounded-full bg-sunken px-2 py-0.5 text-[11.5px] font-medium text-ink-2">
                  {s.shows}
                </span>
              </span>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-1 shrink-0 text-ink-3">
                <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-3 text-pretty">
        Each one is yours alone — nobody else sees it, and you can load another whenever you like.
      </p>
    </div>
  )
}
