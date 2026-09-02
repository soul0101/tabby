'use client'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from '@/lib/supabase/client'
import { useApp } from '@/lib/store'

/**
 * Owns the auth subscription and the initial data load, mounted once at the
 * root. Routes must not do this: a per-route AuthGate re-ran the load on every
 * navigation, which refetched everything and — because the tool layer is gated
 * on status — unregistered the whole surface mid-navigation.
 */
export function AppBootstrap() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const load = useApp((s) => s.load)
  const clear = useApp((s) => s.clear)
  const setSignedIn = useApp((s) => s.setSignedIn)

  useEffect(() => {
    if (!isConfigured()) { setSignedIn(false); return }
    const db = supabase()
    void db.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = db.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [setSignedIn])

  useEffect(() => {
    if (session === undefined) return
    if (!session?.user) { clear(); setSignedIn(false); return }

    setSignedIn(true)
    // Only load once per signed-in user; a token refresh must not refetch.
    if (useApp.getState().you === session.user.id) return
    const meta = session.user.user_metadata as { display_name?: string } | undefined
    const raw = meta?.display_name || session.user.email?.split('@')[0] || 'You'
    void load(session.user.id, raw.charAt(0).toUpperCase() + raw.slice(1))
  }, [session, load, clear, setSignedIn])

  // Handy for end-to-end tests that need the invite link the settings sheet
  // shows, or a second signed-in person to send an invitation to. Never in
  // production — this is the app's own auth client, not a copy.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    ;(window as unknown as { __tabbyAuth?: unknown }).__tabbyAuth = supabase().auth
    return useApp.subscribe((st) => {
      ;(window as unknown as { __tabbyGroups?: unknown }).__tabbyGroups = st.groups
    })
  }, [])

  // Everyone in a group watches the same thread.
  const ready = useApp((s) => s.status === 'ready')
  const groupCount = useApp((s) => s.groups.length)
  useEffect(() => {
    if (!ready || groupCount === 0) return
    return useApp.getState().watchThreads()
  }, [ready, groupCount])

  return null
}
