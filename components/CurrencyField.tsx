'use client'
import { useEffect, useState } from 'react'
import { CURRENCIES, fetchRate, symbolOf } from '@/lib/fx'
import { formatMinor } from '@/lib/money'
import { Label, inputClass } from '@/components/ui'

/**
 * Currency and rate for one expense.
 *
 * The rate is fetched as a convenience but always editable, and whatever is
 * showing is what gets stored — so a trip settled in March keeps March's rate
 * no matter what the market does afterwards.
 */
export function CurrencyField({
  groupCurrency, currency, rate, totalMinor, onCurrency, onRate,
}: {
  groupCurrency: string
  currency: string
  rate: number
  totalMinor: number
  onCurrency: (c: string) => void
  onRate: (r: number) => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'manual'>('idle')

  useEffect(() => {
    if (currency === groupCurrency) { onRate(1); setState('idle'); return }
    let cancelled = false
    setState('loading')
    void fetchRate(currency, groupCurrency).then((r) => {
      if (cancelled) return
      if (r.rate === null) { setState('manual') } else { onRate(r.rate); setState('idle') }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, groupCurrency])

  const foreign = currency !== groupCurrency

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {CURRENCIES.map((c) => (
          <button
            key={c.code} type="button" onClick={() => onCurrency(c.code)} aria-pressed={currency === c.code}
            title={c.name}
            className={`h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors ${
              currency === c.code ? 'border-ink bg-ink text-surface' : 'border-line text-ink-2 hover:border-line-2'
            }`}
          >
            {c.symbol} {c.code}
          </button>
        ))}
      </div>

      {foreign && (
        <div className="grid gap-2 rounded-[12px] bg-canvas p-3">
          <Label>Rate</Label>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[13.5px] text-ink-2">1&nbsp;{currency} =</span>
            <input
              value={Number.isFinite(rate) ? String(rate) : ''}
              inputMode="decimal" aria-label={`Rupees per ${currency}`}
              onChange={(e) => { onRate(parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0); setState('manual') }}
              className={`${inputClass} tnum h-9 w-28`}
            />
            <span className="shrink-0 text-[13.5px] text-ink-2">{groupCurrency}</span>
          </div>
          <p className="text-[12.5px] text-ink-3 text-pretty">
            {state === 'loading' && 'Fetching today’s rate…'}
            {state === 'manual' && 'Couldn’t reach a rate service — enter it yourself.'}
            {state === 'idle' && 'Today’s rate. It’s saved with the expense and won’t change later.'}
          </p>
          {totalMinor > 0 && rate > 0 && (
            <p className="text-[13.5px] font-medium">
              {symbolOf(currency)}{(totalMinor / 100).toFixed(2)} ={' '}
              {formatMinor(Math.round(totalMinor * rate), groupCurrency)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
