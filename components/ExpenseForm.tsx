'use client'
import { useMemo, useState } from 'react'
import { toMinor, fromMinor, formatMinor } from '@/lib/money'
import { computeShares, totalOf } from '@/lib/split'
import { CATEGORIES, CATEGORY_EMOJI, type Category, type Expense, type Group, type LineItem, type SplitMode } from '@/lib/types'
import { ActionBar } from '@/components/ActionBar'
import { Disclosure } from '@/components/Disclosure'
import { DateField, humanDate, todayISO } from '@/components/DateField'
import { PersonPicker } from '@/components/PersonPicker'
import { ReceiptField } from '@/components/ReceiptField'
import { ItemEditor, type DraftItem } from '@/components/ItemEditor'
import { ReceiptCard } from '@/components/ReceiptImage'
import { CurrencyField } from '@/components/CurrencyField'
import { symbolOf } from '@/lib/fx'
import { Amount, Avatar, Button, Label, SplitBar, inputClass } from '@/components/ui'

const MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'equal', label: 'Equally', hint: 'Split evenly between everyone selected' },
  { id: 'shares', label: 'Shares', hint: 'Give someone a bigger slice — the big room, the extra guest' },
  { id: 'exact', label: 'Exact', hint: 'Type what each person owes' },
  { id: 'items', label: 'By item', hint: 'Enter the bill line by line, then tap who had what' },
]

export interface ExpenseDraft {
  description: string
  amount: string
  payerId: string
  category: Category
  date: string
  participants: string[]
  mode: SplitMode
  weights: Record<string, number>
  exact: Record<string, string>
  items: DraftItem[]
  tax: string
  tip: string
  receipt: string | null
  currency: string
  rate: number
}

const emptyItem = (): DraftItem => ({ id: `i_${Math.random().toString(36).slice(2, 8)}`, label: '', amount: '' })

export function draftFrom(expense: Expense | null, group: Group, me: string | null): ExpenseDraft {
  if (!expense) {
    return {
      description: '', amount: '', payerId: me ?? group.members[0]?.id ?? '',
      category: 'food', date: todayISO(),
      participants: group.members.map((m) => m.id), mode: 'equal',
      weights: {}, exact: {}, items: [emptyItem()], tax: '', tip: '', receipt: null,
      currency: group.currency, rate: 1,
    }
  }
  return {
    description: expense.description,
    amount: expense.splitMode === 'items' ? '' : fromMinor(expense.totalMinor).toFixed(2),
    payerId: expense.payerId,
    category: expense.category,
    date: expense.occurredAt.slice(0, 10),
    participants: [...expense.participants],
    mode: expense.splitMode,
    weights: expense.weights ?? {},
    exact: Object.fromEntries(
      Object.entries(expense.exact ?? {}).map(([k, v]) => [k, fromMinor(Number(v)).toFixed(2)]),
    ),
    items: (expense.items ?? []).length
      ? expense.items!.map((i) => ({ id: i.id, label: i.label, amount: fromMinor(i.amountMinor).toFixed(2) }))
      : [emptyItem()],
    tax: expense.taxMinor ? fromMinor(expense.taxMinor).toFixed(2) : '',
    tip: expense.tipMinor ? fromMinor(expense.tipMinor).toFixed(2) : '',
    receipt: null,
    currency: expense.currency,
    rate: expense.fxRate,
  }
}

export interface SubmitPayload {
  description: string
  payerId: string
  category: Category
  occurredAt: string
  participants: string[]
  splitMode: SplitMode
  totalMinor: number
  weights?: Record<string, number>
  exact?: Record<string, number>
  items?: LineItem[]
  taxMinor: number
  tipMinor: number
  receiptDataUrl: string | null
  currency: string
  fxRate: number
}

export function ExpenseForm({
  group, me, existing, onCancel, onSubmit, cta,
}: {
  group: Group
  me: string | null
  existing?: Expense | null
  onCancel: () => void
  onSubmit: (payload: SubmitPayload) => Promise<void>
  cta: string
}) {
  const [d, setD] = useState<ExpenseDraft>(() => draftFrom(existing ?? null, group, me))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof ExpenseDraft>(k: K, v: ExpenseDraft[K]) => {
    setD((p) => ({ ...p, [k]: v })); setError(null)
  }

  const liveItems: LineItem[] = useMemo(
    () => d.items
      .filter((i) => i.label.trim() && (parseFloat(i.amount) || 0) > 0)
      .map((i) => ({
        id: i.id, label: i.label.trim(), amountMinor: toMinor(parseFloat(i.amount)),
        eatenBy: existing?.items?.find((x) => x.id === i.id)?.eatenBy ?? [],
      })),
    [d.items, existing],
  )

  const taxMinor = toMinor(parseFloat(d.tax) || 0)
  const tipMinor = toMinor(parseFloat(d.tip) || 0)
  const itemsTotal = liveItems.reduce((s, i) => s + i.amountMinor, 0) + taxMinor + tipMinor
  const totalMinor = d.mode === 'items' ? itemsTotal : toMinor(parseFloat(d.amount) || 0)

  const preview = useMemo(() => {
    if (d.participants.length === 0 || totalMinor <= 0) return {}
    return computeShares({
      id: 'preview', groupId: group.id, payerId: d.payerId, description: d.description,
      category: d.category, occurredAt: d.date, currency: group.currency,
      participants: d.participants, splitMode: d.mode, totalMinor,
      weights: d.weights,
      exact: Object.fromEntries(Object.entries(d.exact).map(([k, v]) => [k, toMinor(parseFloat(v) || 0)])),
      items: liveItems, taxMinor, tipMinor, extrasPolicy: existing?.extrasPolicy ?? 'proportional',
      fxRate: 1, baseTotalMinor: totalMinor,
      rationale: [], createdBy: 'human', createdAt: '',
    })
  }, [d, totalMinor, liveItems, taxMinor, tipMinor, group, existing])

  const exactSum = Object.values(d.exact).reduce((s, v) => s + toMinor(parseFloat(v) || 0), 0)
  const exactGap = totalMinor - exactSum
  const people = group.members.filter((m) => d.participants.includes(m.id))
  const payer = group.members.find((m) => m.id === d.payerId)
  const nameOf = (id: string) => (id === me ? 'You' : group.members.find((m) => m.id === id)?.name ?? '')

  const splitSummary = d.mode === 'equal'
    ? `Equally · ${d.participants.length} ${d.participants.length === 1 ? 'person' : 'people'}`
    : d.mode === 'items'
      ? `By item · ${liveItems.length} lines`
      : `${d.mode === 'shares' ? 'By shares' : 'Exact amounts'} · ${d.participants.length}`

  const submit = async () => {
    if (!d.description.trim()) return setError('What was this for?')
    if (d.mode === 'items' && liveItems.length === 0) {
      return setError('Add at least one line with a name and an amount.')
    }
    if (totalMinor <= 0) return setError('Enter an amount greater than zero.')
    if (d.participants.length === 0) return setError('Pick at least one person to split this with.')
    if (d.currency !== group.currency && (!d.rate || d.rate <= 0)) {
      return setError(`Enter what 1 ${d.currency} is worth in ${group.currency}.`)
    }
    if (d.mode === 'exact' && exactGap !== 0) {
      return setError(
        `Those add up to ${formatMinor(exactSum, group.currency)} — ${formatMinor(Math.abs(exactGap), group.currency)} ${exactGap > 0 ? 'short' : 'over'}.`,
      )
    }

    setBusy(true)
    try {
      await onSubmit({
        description: d.description.trim(),
        payerId: d.payerId,
        category: d.category,
        occurredAt: new Date(`${d.date}T12:00:00`).toISOString(),
        participants: d.participants,
        splitMode: d.mode,
        totalMinor,
        weights: d.mode === 'shares' ? d.weights : undefined,
        exact: d.mode === 'exact'
          ? Object.fromEntries(d.participants.map((id) => [id, toMinor(parseFloat(d.exact[id] ?? '0') || 0)]))
          : undefined,
        items: d.mode === 'items' ? liveItems : undefined,
        taxMinor: d.mode === 'items' ? taxMinor : 0,
        tipMinor: d.mode === 'items' ? tipMinor : 0,
        receiptDataUrl: d.receipt,
        currency: d.currency,
        fxRate: d.currency === group.currency ? 1 : d.rate,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save that.')
      setBusy(false)
    }
  }

  const toggle = (id: string) =>
    set('participants', d.participants.includes(id)
      ? d.participants.filter((x) => x !== id)
      : [...d.participants, id])

  return (
    <>
      <div className="grid gap-4">
        {/* Amount leads — it's the one thing you always know. */}
        <div className="grid justify-items-center gap-1.5 py-2">
          <div className="flex items-center">
            <span className="font-display text-[38px] font-bold leading-none tracking-[-0.03em] text-ink-3">
              {symbolOf(d.currency)}
            </span>
            <input
              value={d.mode === 'items' ? (itemsTotal / 100).toFixed(2) : d.amount}
              readOnly={d.mode === 'items'}
              data-autofocus={d.mode !== 'items' || undefined}
              inputMode="decimal" autoComplete="off" aria-label="Amount"
              onChange={(e) => set('amount', e.target.value.replace(/[^0-9.]/g, ''))}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                const n = parseFloat(e.target.value)
                if (!Number.isNaN(n)) set('amount', n.toFixed(2))
              }}
              placeholder="0"
              className="tnum min-w-0 border-0 bg-transparent p-0 text-left font-display text-[46px] font-bold leading-none tracking-[-0.035em] outline-none placeholder:text-ink-3/35 focus:ring-0"
              style={{
                width: `${Math.max(1, (d.mode === 'items' ? (itemsTotal / 100).toFixed(2) : d.amount || '0').length)}ch`,
              }}
            />
          </div>
          {d.mode === 'items' && <span className="text-[12.5px] text-ink-3">adds up from the lines below</span>}
        </div>

        <input
          value={d.description} autoComplete="off" aria-label="What was it for?"
          onChange={(e) => set('description', e.target.value)}
          placeholder="What was it for?"
          className={`${inputClass} h-12 text-center text-[16px]`}
        />

        {/* Category and date sit as chips — quick to change, quiet when not. */}
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
          style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map((c) => (
            <button
              key={c} type="button" onClick={() => set('category', c)} aria-pressed={d.category === c}
              aria-label={c}
              title={c}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-all ${
                d.category === c ? 'border-ink bg-ink scale-105' : 'border-line hover:border-line-2'
              }`}
            >
              <span className="emoji text-[15px]" aria-hidden="true">{CATEGORY_EMOJI[c]}</span>
            </button>
          ))}
        </div>

        <div className="rounded-[14px] border border-line px-4">
          <Disclosure label="Date" value={humanDate(d.date)}>
            <DateField value={d.date} onChange={(v) => set('date', v)} />
          </Disclosure>

          <Disclosure label="Paid by" value={payer ? nameOf(payer.id) : '—'}>
            <div className="flex flex-wrap gap-1.5">
              {group.members.map((m) => (
                <button
                  key={m.id} type="button" onClick={() => set('payerId', m.id)} aria-pressed={d.payerId === m.id}
                  className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition-colors ${
                    d.payerId === m.id ? 'border-ink bg-ink text-surface' : 'border-line text-ink-2 hover:border-line-2'
                  }`}
                >
                  <Avatar person={m} size={26} muted={d.payerId !== m.id} />
                  <span className="text-[13.5px] font-medium">{nameOf(m.id)}</span>
                </button>
              ))}
            </div>
          </Disclosure>

          <Disclosure
            label="Currency"
            value={d.currency === group.currency
              ? d.currency
              : `${d.currency} → ${formatMinor(Math.round(totalMinor * d.rate), group.currency)}`}
          >
            <CurrencyField
              groupCurrency={group.currency} currency={d.currency} rate={d.rate}
              totalMinor={totalMinor}
              onCurrency={(c) => set('currency', c)}
              onRate={(r) => set('rate', r)}
            />
          </Disclosure>

          <Disclosure label="Split" value={splitSummary}>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <div className="flex gap-1 rounded-[12px] bg-sunken p-1">
                  {MODES.map((m) => (
                    <button
                      key={m.id} type="button" onClick={() => set('mode', m.id)} aria-pressed={d.mode === m.id}
                      className={`h-9 flex-1 rounded-[9px] text-[13px] font-semibold transition-all ${
                        d.mode === m.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[13px] text-ink-3">{MODES.find((m) => m.id === d.mode)!.hint}</p>
              </div>

              <div>
                <Label className="mb-2">Between</Label>
                <PersonPicker people={group.members} selected={d.participants} onToggle={toggle} youId={me ?? undefined} />
              </div>

              {d.mode === 'shares' && (
                <ul className="grid gap-2">
                  {people.map((m) => (
                    <li key={m.id} className="flex items-center gap-3">
                      <Avatar person={m} size={30} />
                      <span className="min-w-0 flex-1 truncate text-[14px]">{nameOf(m.id)}</span>
                      <div className="flex items-center gap-1">
                        <Button size="sm" aria-label={`Fewer shares for ${m.name}`}
                          onClick={() => set('weights', { ...d.weights, [m.id]: Math.max(0, (d.weights[m.id] ?? 1) - 1) })}>−</Button>
                        <span className="tnum w-8 text-center text-[15px] font-semibold">{d.weights[m.id] ?? 1}</span>
                        <Button size="sm" aria-label={`More shares for ${m.name}`}
                          onClick={() => set('weights', { ...d.weights, [m.id]: (d.weights[m.id] ?? 1) + 1 })}>+</Button>
                      </div>
                      <Amount minor={preview[m.id] ?? 0} currency={group.currency} size="sm" className="w-24 text-right text-ink-2" />
                    </li>
                  ))}
                </ul>
              )}

              {d.mode === 'exact' && (
                <ul className="grid gap-2">
                  {people.map((m) => (
                    <li key={m.id} className="flex items-center gap-3">
                      <Avatar person={m} size={30} />
                      <span className="min-w-0 flex-1 truncate text-[14px]">{nameOf(m.id)}</span>
                      <div className="relative w-32">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-3">₹</span>
                        <input
                          value={d.exact[m.id] ?? ''} inputMode="decimal" aria-label={`Amount for ${m.name}`}
                          onChange={(e) => set('exact', { ...d.exact, [m.id]: e.target.value.replace(/[^0-9.]/g, '') })}
                          placeholder="0.00" className={`${inputClass} tnum h-10 pl-6 text-right`}
                        />
                      </div>
                    </li>
                  ))}
                  <li className="flex items-baseline justify-between border-t border-line pt-2 text-[13.5px]">
                    <span className="text-ink-2">Adds up to</span>
                    <span className={exactGap === 0 ? 'text-positive' : 'text-negative'}>
                      <Amount minor={exactSum} currency={group.currency} size="sm" />
                      {exactGap !== 0 && ` · ${formatMinor(Math.abs(exactGap), group.currency)} ${exactGap > 0 ? 'left' : 'over'}`}
                    </span>
                  </li>
                </ul>
              )}

              {d.mode === 'items' && (
                <ItemEditor
                  items={d.items} onChange={(v) => set('items', v)}
                  tax={d.tax} tip={d.tip}
                  onTax={(v) => set('tax', v)} onTip={(v) => set('tip', v)}
                  currency={group.currency}
                />
              )}
            </div>
          </Disclosure>
        </div>

        {existing?.receiptPath && !d.receipt ? (
          <div className="grid gap-2">
            <Label>Receipt</Label>
            <ReceiptCard path={existing.receiptPath} alt={`Receipt for ${existing.description}`} />
          </div>
        ) : (
          <ReceiptField value={d.receipt} onChange={(v) => set('receipt', v)} />
        )}

        {totalMinor > 0 && d.participants.length > 0 && (
          <div className="rounded-[14px] bg-canvas p-4">
            <div className="flex items-baseline justify-between">
              <Label>Everyone pays</Label>
              {d.mode === 'equal' && (
                <span className="text-[13px] text-ink-2">
                  {formatMinor(Math.round(totalMinor / d.participants.length), d.currency)} each
                </span>
              )}
            </div>
            <SplitBar shares={preview} people={group.members} currency={d.currency} className="mt-2.5" />
            <ul className="mt-3 grid gap-1.5">
              {people.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 text-[13.5px]">
                  <Avatar person={m} size={22} />
                  <span className="min-w-0 flex-1 truncate">{nameOf(m.id)}</span>
                  <Amount minor={preview[m.id] ?? 0} currency={d.currency} size="sm" className="font-semibold" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ActionBar error={error}>
        <Button className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" variant="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Saving…' : cta}
        </Button>
      </ActionBar>
    </>
  )
}
