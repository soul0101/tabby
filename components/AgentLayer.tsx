'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { ToolProvider } from '@/lib/webmcp/ToolProvider'
import { CallLog } from '@/components/CallLog'
import { AgentBanner } from '@/components/AgentBanner'

/**
 * Mounted once at the root, deliberately not inside a route.
 *
 * Registration is torn down through an AbortSignal, so two overlapping
 * providers during a client-side navigation would let the departing one
 * unregister the arriving one's tools. The surface belongs to the app.
 */
export function AgentLayer() {
  const signedIn = useApp((s) => s.you !== null)
  const setNavigate = useApp((s) => s.setNavigate)
  const router = useRouter()

  // Hand the router to the tool layer, which sits outside React.
  useEffect(() => { setNavigate((path) => router.push(path)) }, [router, setNavigate])

  if (!signedIn) return null
  return (
    <>
      <ToolProvider />
      <AgentBanner />
      <CallLog />
    </>
  )
}
