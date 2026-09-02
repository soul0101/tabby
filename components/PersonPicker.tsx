'use client'
import type { Person } from '@/lib/types'
import { Avatar } from '@/components/ui'

/**
 * "Who had this?" — a strip of tappable people.
 * This replaces a checkbox matrix: it is how a person actually thinks about a
 * bill, works one-handed on a phone, and stays fast on desktop.
 */
export function PersonPicker({
  people, selected, onToggle, size = 40, label, youId,
}: {
  people: Person[]
  selected: string[]
  onToggle: (id: string) => void
  size?: number
  label?: string
  youId?: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label ?? 'Who’s involved'}>
      {people.map((p) => {
        const on = selected.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            aria-pressed={on}
            className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition-all duration-150 active:scale-[0.97]"
            style={{
              borderColor: on ? 'var(--color-ink)' : 'var(--color-line)',
              background: on ? 'var(--color-ink)' : 'var(--color-surface)',
              color: on ? 'var(--color-surface)' : 'var(--color-ink-2)',
            }}
          >
            <Avatar person={p} size={size * 0.7} muted={!on} />
            <span className="text-[13.5px] font-medium">{p.id === youId ? 'You' : p.name}</span>
          </button>
        )
      })}
    </div>
  )
}
