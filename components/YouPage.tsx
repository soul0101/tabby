'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { ActionBar } from '@/components/ActionBar'
import { Button, Field, Label, inputClass } from '@/components/ui'
import { toast } from '@/components/Toast'
import { forgetChoice, recallChoice, scenarioById } from '@/lib/scenarios'

export function YouPage() {
  const router = useRouter()
  const onClose = () => router.push('/')
  const yourName = useApp((s) => s.yourName)
  const setYourName = useApp((s) => s.setYourName)
  const [name, setName] = useState(yourName)
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [current, setCurrent] = useState<{ you: string; title: string } | null>(null)

  // Remembered locally, so the app can name back what you're looking at.
  useEffect(() => {
    const choice = recallChoice()
    const scenario = choice ? scenarioById(choice.scenarioId) : null
    setCurrent(scenario && choice ? { you: choice.you, title: scenario.title } : null)
  }, [])
  const groups = useApp((s) => s.groups)
  const deleteGroup = useApp((s) => s.deleteGroup)

  // Recording a demo means running the same sequence several times.
  const resetEverything = async () => {
    setBusy(true)
    try {
      for (const g of [...groups]) await deleteGroup(g.id)
      forgetChoice()
      toast('Cleared — pick a scenario to start again')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t clear that', { tone: 'error' })
      setBusy(false)
    }
  }

  const save = async () => {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      await setYourName(n)
      toast('Saved', { tone: 'success' })
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t save that', { tone: 'error' })
      setBusy(false)
    }
  }

  return (
    <Shell back={{ href: '/', label: 'Groups' }}
      title={<span className="text-[15px] font-semibold">You</span>}>
      <p className="mb-5 text-[14px] leading-relaxed text-ink-2 text-pretty">
        This is the name your friends see next to expenses you paid for.
      </p>
      <div className="grid gap-5">
        <Field label="Your name" htmlFor="yname">
          <input
            id="yname" value={name} data-autofocus autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
            className={inputClass}
          />
        </Field>

        {current && (
          <div className="border-t border-line pt-4">
            <Label className="mb-1.5">You’re trying a scenario</Label>
            <p className="text-[13.5px] leading-relaxed text-ink-2 text-pretty">
              You’re <strong className="font-semibold text-ink">{current.you}</strong> in{' '}
              <strong className="font-semibold text-ink">{current.title}</strong>.
            </p>
            <Link
              href="/try"
              className="mt-2 inline-flex h-9 items-center rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold transition-colors hover:bg-canvas"
            >
              Try a different one
            </Link>
          </div>
        )}

        {groups.length > 0 && (
          <div className="border-t border-line pt-4">
            <Label className="mb-1.5">Start over</Label>
            {confirmReset ? (
              <div className="grid gap-2.5">
                <p className="text-[13.5px] leading-relaxed text-ink-2 text-pretty">
                  Delete all {groups.length} {groups.length === 1 ? 'group' : 'groups'} and everything in
                  them? Useful between demo takes, permanent otherwise.
                </p>
                <div className="flex gap-2.5">
                  <Button className="flex-1" onClick={() => setConfirmReset(false)}>Keep them</Button>
                  <Button className="flex-1" variant="danger" disabled={busy}
                    onClick={() => void resetEverything()}>
                    {busy ? 'Clearing…' : 'Delete everything'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-2 text-[13px] leading-relaxed text-ink-3 text-pretty">
                  Clear every group so you can load the sample trip fresh.
                </p>
                <Button onClick={() => setConfirmReset(true)}>Clear all data</Button>
              </>
            )}
          </div>
        )}
        <div className="border-t border-line pt-4">
          <button
            onClick={async () => { await supabase().auth.signOut(); window.location.href = '/' }}
            className="text-[13.5px] font-semibold text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>

      <ActionBar>
        <Button className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" variant="primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </ActionBar>
    </Shell>
  )
}
