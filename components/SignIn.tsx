'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button, Field, inputClass } from '@/components/ui'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sendLink = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('That doesn’t look like an email address.'); return }
    setState('sending'); setError(null)
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`,
      },
    })
    if (error) { setError(error.message); setState('idle'); return }
    setState('sent')
  }

  const tryIt = async () => {
    setBusy(true); setError(null)
    const { error } = await supabase().auth.signInAnonymously()
    if (error) { setError(error.message); setBusy(false); return }
    // Stay where you were — landing on an invite link and being bounced home
    // loses the invite.
    window.location.reload()
  }

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="font-display text-[34px] font-bold leading-[1.1] tracking-[-0.035em]">Tabby</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2 text-pretty">
            Split the bill, not the friendship. Snap the receipt, tap who had what, settle up in the
            fewest payments.
          </p>
        </div>

        {state === 'sent' ? (
          <div className="card p-5">
            <h2 className="font-display text-[18px] font-semibold">Check your email</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2 text-pretty">
              We sent a sign-in link to <strong className="font-semibold text-ink">{email}</strong>.
              Open it on this device and you’re in.
            </p>
            <Button className="mt-4 w-full" onClick={() => setState('idle')}>Use a different email</Button>
          </div>
        ) : (
          <div className="card grid gap-4 p-5">
            <Field label="Email" htmlFor="email" error={error ?? undefined}>
              <input
                id="email" type="email" value={email} data-autofocus
                autoComplete="email" inputMode="email" spellCheck={false}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') void sendLink() }}
                placeholder="you@example.com" className={inputClass}
              />
            </Field>
            <Button variant="primary" size="lg" onClick={() => void sendLink()} disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[12.5px] text-ink-3">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <Button size="lg" onClick={() => void tryIt()} disabled={busy}>
              {busy ? 'Setting up…' : 'Try it without an account'}
            </Button>
            <p className="text-center text-[12.5px] leading-relaxed text-ink-3 text-pretty">
              No password, ever. People you add to a group don’t need an account at all.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
