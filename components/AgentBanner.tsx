'use client'
import { useEffect, useState } from 'react'
import { useAgentActivity } from '@/lib/webmcp/activity'
import { useCallLog } from '@/lib/webmcp/log'

/** What each tool is doing, in words a person would use. */
const SAYS: Record<string, string> = {
  get_context: 'Looking at your groups',
  list_expenses: 'Reading the expenses',
  get_balances: 'Working out who owes whom',
  explain_expense: 'Checking how that was split',
  who_owes_whom: 'Comparing the two of you',
  get_insights: 'Adding up where the money went',
  open_group: 'Opening the group',
  open_view: 'Changing the view',
  focus_expense: 'Pointing at an expense',
  add_expense: 'Adding an expense',
  itemise_expense: 'Reading the bill line by line',
  assign_items: 'Working out who had what',
  update_expense: 'Updating the expense',
  delete_expense: 'Removing an expense',
  settle_up: 'Recording a payment',
  add_person: 'Adding someone',
  create_group: 'Starting a group',
  list_receipts: 'Looking for receipts',
  read_receipt: 'Reading the receipt',
}

/**
 * A live line at the top of the screen while the agent works.
 *
 * The tool log proves calls are landing; this says what they *mean*, and it
 * lingers a moment after the last call so a burst reads as one action rather
 * than a flicker.
 */
export function AgentBanner() {
  const running = useAgentActivity((s) => s.running)
  const narration = useAgentActivity((s) => s.narration)
  const lastCall = useCallLog((s) => s.entries[0])
  const [visible, setVisible] = useState(false)
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    if (running) {
      setText(narration ?? SAYS[running] ?? running.replace(/_/g, ' '))
      setVisible(true)
      return
    }
    // Hold briefly so a run of quick calls doesn't strobe.
    const t = setTimeout(() => setVisible(false), 900)
    return () => clearTimeout(t)
  }, [running, narration])

  useEffect(() => {
    if (!running && lastCall && !lastCall.ok) {
      setText('That didn’t work')
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 2400)
      return () => clearTimeout(t)
    }
  }, [lastCall, running])

  if (!visible || !text) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[55] flex justify-center px-4"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex items-center gap-2.5 overflow-hidden rounded-full border border-line bg-surface/95 py-2 pl-3 pr-4 shadow-pop backdrop-blur"
        style={{ animation: 'banner-in .24s cubic-bezier(.2,.9,.3,1)' }}
      >
        <span className="relative grid h-5 w-5 place-items-center" aria-hidden="true">
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: 'var(--color-agent-wash)' }}
          />
          <span
            className="relative text-[11px] font-bold"
            style={{ color: 'var(--color-agent)', animation: running ? 'spark 1.1s ease-in-out infinite' : undefined }}
          >
            ✦
          </span>
        </span>
        <span className="text-[13.5px] font-medium text-ink">{text}</span>
        {running && (
          <span className="relative h-[3px] w-8 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <span
              className="absolute inset-y-0 w-1/3 rounded-full"
              style={{ background: 'var(--color-agent)', animation: 'agent-sweep 1s ease-in-out infinite' }}
            />
          </span>
        )}
      </div>
    </div>
  )
}
