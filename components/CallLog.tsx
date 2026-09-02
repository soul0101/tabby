'use client'
import { useEffect, useState } from 'react'
import { useCallLog } from '@/lib/webmcp/log'
import { hasWebMcp } from '@/lib/webmcp/useWebMcpTool'
import { ALL_TOOLS } from '@/lib/webmcp/ToolProvider'
import { useApp } from '@/lib/store'
import { useAgentActivity } from '@/lib/webmcp/activity'
import { Label } from '@/components/ui'

type Tab = 'calls' | 'tools'

/** Arguments at a glance — the raw JSON is unreadable at this size. */
function summarise(args: unknown): string {
  const o = args as Record<string, unknown>
  return Object.entries(o)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${v.length}`
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      return `${k}: ${s.length > 22 ? `${s.slice(0, 22)}…` : s}`
    })
    .join('  ')
}

/**
 * A live feed of tool calls, and what's currently registered.
 *
 * Half debug surface, half proof: it's how you tell that real calls are
 * landing, and it lets someone without an agent client see what one could do.
 */
export function CallLog() {
  const entries = useCallLog((s) => s.entries)
  const open = useCallLog((s) => s.open)
  const toggle = useCallLog((s) => s.toggle)
  const anyReceipts = useApp((s) => s.expenses.some((e) => e.receiptPath))
  const [tab, setTab] = useState<Tab>('calls')
  const [connected, setConnected] = useState(false)
  const running = useAgentActivity((s) => s.running)

  useEffect(() => {
    setConnected(hasWebMcp())
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const live = (name: string) =>
    anyReceipts || !['list_receipts', 'read_receipt'].includes(name)
  const registered = ALL_TOOLS.filter((t) => live(t.name)).length

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 z-40 flex max-h-[70dvh] w-full max-w-sm flex-col justify-end p-3">
      {open && (
        <div className="pointer-events-auto mb-2 flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-pop">
          <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
            {(['calls', 'tools'] as Tab[]).map((t) => (
              <button
                key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
                className={`rounded-[8px] px-2 py-1 transition-colors ${tab === t ? 'bg-sunken' : 'hover:bg-canvas'}`}
              >
                <span className="label" style={tab === t ? { color: 'var(--color-ink)' } : undefined}>
                  {t === 'calls' ? `Calls · ${entries.length}` : `Tools · ${registered}`}
                </span>
              </button>
            ))}
          </div>

          {tab === 'tools' ? (
            <ul className="min-h-0 flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
              {ALL_TOOLS.map((t) => (
                <li key={t.name} className="border-b border-line/70 px-3 py-2 last:border-0">
                  <div className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: live(t.name) ? 'var(--color-positive)' : 'var(--color-line-2)' }} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{t.name}</span>
                    {t.destructive && <span className="label" style={{ color: 'var(--color-negative)' }}>asks</span>}
                  </div>
                  <p className="mt-0.5 pl-3.5 text-[11.5px] leading-snug text-ink-3 text-pretty">
                    {t.description.split('.')[0]}.
                    {!live(t.name) && ' Not registered — no receipts attached.'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
              {entries.length === 0 ? (
                <li className="px-3 py-6 text-center text-[12.5px] leading-relaxed text-ink-3 text-pretty">
                  {connected
                    ? 'No calls yet. Ask your agent about this group.'
                    : 'No agent connected. Open this in ChatGPT’s browser, or Chrome with WebMCP enabled — the Tools tab shows what one could do.'}
                </li>
              ) : (
                entries.map((e, i) => (
                  <li
                    key={e.id}
                    className="border-b border-line/70 px-3 py-2 last:border-0"
                    style={i === 0 ? { animation: 'call-in .22s cubic-bezier(.2,.9,.3,1)' } : undefined}
                  >
                    <div className="flex items-baseline gap-2">
                      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: e.ok ? 'var(--color-positive)' : 'var(--color-negative)' }} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium">{e.tool}</span>
                      <span className="tnum shrink-0 rounded-full bg-sunken px-1.5 text-[10.5px] text-ink-3">
                        {e.ms}&nbsp;ms
                      </span>
                    </div>
                    {Object.keys(e.args as object).length > 0 && (
                      <p className="mt-1 truncate pl-3.5 font-mono text-[10.5px] leading-relaxed text-ink-3">
                        {summarise(e.args)}
                      </p>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      <button
        type="button" onClick={toggle} aria-expanded={open}
        className="pointer-events-auto mr-auto flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 shadow-sm transition-colors hover:border-line-2"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full"
          style={{
            background: running ? 'var(--color-agent)' : connected ? 'var(--color-positive)' : 'var(--color-ink-3)',
            animation: running ? 'spark .9s ease-in-out infinite' : undefined,
          }} />
        <span className="label">{connected ? `${registered} tools live` : `${registered} tools · no agent`}</span>
        {entries.length > 0 && (
          <span className="tnum rounded-full bg-sunken px-1.5 text-[10.5px]">{entries.length}</span>
        )}
      </button>
    </div>
  )
}
