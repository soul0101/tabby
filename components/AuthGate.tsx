'use client'
import { useApp } from '@/lib/store'
import { isConfigured } from '@/lib/supabase/client'
import { SignIn } from '@/components/SignIn'

/**
 * Reads auth state only. The subscription and the data load live in
 * AppBootstrap at the root, so navigating between routes doesn't refetch.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const signedIn = useApp((s) => s.signedIn)

  if (!isConfigured()) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-[22px] font-semibold">Backend not configured</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2 text-pretty">
            Set <code className="rounded bg-sunken px-1.5 py-0.5 text-[13px]">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-sunken px-1.5 py-0.5 text-[13px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{' '}
            in <code className="rounded bg-sunken px-1.5 py-0.5 text-[13px]">.env.local</code>, then restart the dev server.
          </p>
        </div>
      </div>
    )
  }

  if (signedIn === null) return <div className="min-h-dvh" />
  if (!signedIn) return <SignIn />
  return <>{children}</>
}
