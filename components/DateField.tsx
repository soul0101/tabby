'use client'
import { inputClass } from '@/components/ui'

const iso = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export const todayISO = () => iso(new Date())
export const daysAgoISO = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return iso(d)
}

export function humanDate(dateISO: string): string {
  if (dateISO === todayISO()) return 'Today'
  if (dateISO === daysAgoISO(1)) return 'Yesterday'
  const d = new Date(`${dateISO}T12:00:00`)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const quick = [
    { label: 'Today', v: todayISO() },
    { label: 'Yesterday', v: daysAgoISO(1) },
    { label: '2 days ago', v: daysAgoISO(2) },
  ]
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <button
            key={q.label} type="button" onClick={() => onChange(q.v)} aria-pressed={value === q.v}
            className={`h-9 rounded-full border px-3 text-[13.5px] font-medium transition-colors ${
              value === q.v ? 'border-ink bg-ink text-surface' : 'border-line text-ink-2 hover:border-line-2'
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>
      <input
        type="date" value={value} max={todayISO()} aria-label="Date of the expense"
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} h-10`}
      />
    </div>
  )
}
