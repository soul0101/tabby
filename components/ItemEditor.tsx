'use client'
import { useRef } from 'react'
import { toMinor } from '@/lib/money'
import { Amount, Button, Label, inputClass } from '@/components/ui'

export interface DraftItem { id: string; label: string; amount: string }

const newItem = (): DraftItem => ({
  id: `i_${Math.random().toString(36).slice(2, 8)}`, label: '', amount: '',
})

export function ItemEditor({
  items, onChange, tax, tip, onTax, onTip, currency,
}: {
  items: DraftItem[]
  onChange: (items: DraftItem[]) => void
  tax: string
  tip: string
  onTax: (v: string) => void
  onTip: (v: string) => void
  currency: string
}) {
  const lastLabel = useRef<HTMLInputElement>(null)

  const subtotal = items.reduce((s, i) => s + toMinor(parseFloat(i.amount) || 0), 0)
  const total = subtotal + toMinor(parseFloat(tax) || 0) + toMinor(parseFloat(tip) || 0)

  const set = (id: string, patch: Partial<DraftItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  const add = () => {
    onChange([...items, newItem()])
    requestAnimationFrame(() => lastLabel.current?.focus())
  }

  return (
    <div className="grid gap-2.5">
      <Label>What was on the bill?</Label>

      <ul className="grid gap-1.5">
        {items.map((item, i) => (
          <li key={item.id} className="flex gap-2">
            <input
              ref={i === items.length - 1 ? lastLabel : undefined}
              value={item.label}
              onChange={(e) => set(item.id, { label: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && i === items.length - 1) { e.preventDefault(); add() } }}
              placeholder={i === 0 ? 'Butter garlic prawns' : 'Item'}
              aria-label={`Item ${i + 1} name`}
              autoComplete="off"
              className={`${inputClass} h-10 flex-1`}
            />
            <div className="relative w-28 shrink-0">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-3">₹</span>
              <input
                value={item.amount} inputMode="decimal"
                onChange={(e) => set(item.id, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="0.00" aria-label={`Item ${i + 1} amount`} autoComplete="off"
                className={`${inputClass} tnum h-10 pl-6 text-right`}
              />
            </div>
            <Button
              size="sm" variant="ghost" aria-label={`Remove ${item.label || `item ${i + 1}`}`}
              onClick={() => onChange(items.length === 1 ? [newItem()] : items.filter((x) => x.id !== item.id))}
            >
              ✕
            </Button>
          </li>
        ))}
      </ul>

      <Button onClick={add} className="justify-start">+ Add line</Button>

      <div className="mt-1 grid grid-cols-2 gap-2.5">
        <div className="grid gap-1.5">
          <label htmlFor="tax" className="text-[13px] font-semibold text-ink-2">Tax</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-3">₹</span>
            <input
              id="tax" value={tax} inputMode="decimal" placeholder="0.00" autoComplete="off"
              onChange={(e) => onTax(e.target.value.replace(/[^0-9.]/g, ''))}
              className={`${inputClass} tnum h-10 pl-7`}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="tip" className="text-[13px] font-semibold text-ink-2">Tip &amp; service</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-3">₹</span>
            <input
              id="tip" value={tip} inputMode="decimal" placeholder="0.00" autoComplete="off"
              onChange={(e) => onTip(e.target.value.replace(/[^0-9.]/g, ''))}
              className={`${inputClass} tnum h-10 pl-7`}
            />
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-line pt-2.5 text-[14px]">
        <span className="text-ink-2">
          Bill total <span className="text-ink-3">· {items.filter((i) => i.label.trim()).length} lines</span>
        </span>
        <Amount minor={total} currency={currency} size="md" className="font-semibold" />
      </div>
    </div>
  )
}
