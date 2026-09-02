'use client'
import { useId, useState } from 'react'

/**
 * A settled row that opens in place.
 *
 * The common expense — "dinner, split evenly, I paid" — should need no
 * decisions at all, so the defaults are stated as a sentence and only unfold
 * when someone actually wants to change them.
 */
export function Disclosure({
  label, value, children, defaultOpen = false, icon,
}: {
  label: string
  value: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  icon?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-canvas/60"
      >
        {icon && <span className="shrink-0 text-ink-3">{icon}</span>}
        <span className="shrink-0 text-[13px] font-semibold text-ink-2">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[14px]">{value}</span>
        <svg
          width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"
          className="shrink-0 text-ink-3 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          <path d="M4 6.5 8 10.5l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={id} className="pb-4" style={{ animation: 'pop-in .18s ease-out' }}>
          {children}
        </div>
      )}
    </div>
  )
}
