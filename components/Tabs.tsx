'use client'

export interface TabDef<T extends string> {
  id: T
  label: string
  badge?: number
}

/** The one tab strip the app uses, so every level of it looks the same. */
export function Tabs<T extends string>({
  tabs, value, onChange, label, size = 'md',
}: {
  tabs: TabDef<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  size?: 'md' | 'sm'
}) {
  if (size === 'sm') {
    return (
      <div className="flex gap-1" role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors ${
              value === t.id
                ? 'bg-ink text-surface'
                : 'border border-line text-ink-2 hover:border-line-2 hover:text-ink'
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span
                className="tnum rounded-full px-1.5 text-[10.5px] font-bold"
                style={{
                  background: value === t.id ? 'var(--color-surface)' : 'var(--color-agent)',
                  color: value === t.id ? 'var(--color-ink)' : 'var(--color-surface)',
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-1 rounded-[12px] bg-sunken p-1" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] text-[13px] font-semibold capitalize transition-all duration-150 sm:text-[14px] ${
            value === t.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {t.label}
          {t.badge !== undefined && t.badge > 0 && (
            <span
              className="tnum rounded-full px-1.5 text-[10.5px] font-bold"
              style={{ background: 'var(--color-agent)', color: 'var(--color-surface)' }}
            >
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
