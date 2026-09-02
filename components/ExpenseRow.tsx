'use client'
import { computeShares, totalOf } from '@/lib/split'
import { CATEGORY_EMOJI, type Expense, type Group } from '@/lib/types'
import { Amount, AnimatedAmount, SplitBar } from '@/components/ui'
import { useTouched } from '@/lib/webmcp/activity'
import Link from 'next/link'
import { useApp } from '@/lib/store'

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const days = Math.round((+new Date(now.toDateString()) - +new Date(d.toDateString())) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function ExpenseRow({
  expense, group, me, href,
}: { expense: Expense; group: Group; me: string | null; href: string }) {
  const touched = useTouched(expense.id)
  const pending = useApp((s) => s.messages.filter(
    (m) => m.expenseId === expense.id && m.kind === 'proposal' && m.status === 'pending',
  ).length)
  const shares = computeShares(expense)
  const total = totalOf(expense)
  const payer = group.members.find((m) => m.id === expense.payerId)
  const yourShare = me ? shares[me] ?? 0 : 0
  const youPaid = me !== null && expense.payerId === me
  const yourNet = (youPaid ? total : 0) - yourShare

  return (
    <Link
      href={href}
      className={`group block w-full rounded-[13px] px-3 py-3 text-left transition-colors hover:bg-surface ${
        touched ? 'agent-touched' : ''
      }`}
    >
      <span className="flex items-center gap-3.5">
        <span aria-hidden="true" className="emoji grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-sunken text-[18px]">
          {CATEGORY_EMOJI[expense.category]}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[15px] font-semibold tracking-[-0.005em]">{expense.description}</span>
            {expense.receiptPath && (
              <span
                aria-label="Has a receipt"
                title="Receipt attached"
                className="shrink-0 text-ink-3"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.5 2.5h9v11l-1.6-1.1-1.6 1.1-1.6-1.1-1.6 1.1-1.6-1.1L3.5 13.5v-11Z"
                    stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M6 5.5h4M6 8h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </span>
            )}
            {pending > 0 && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ color: 'var(--color-agent)', background: 'var(--color-agent-wash)' }}
              >
                {pending === 1 ? '1 proposal' : `${pending} proposals`}
              </span>
            )}
            {expense.needsReview && (
              <span className="shrink-0 rounded-full bg-warn-wash px-2 py-0.5 text-[11px] font-semibold text-warn">
                Check this
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-ink-2">
            {dayLabel(expense.occurredAt)} · {youPaid ? 'You' : payer?.name} paid{' '}
            <Amount minor={total} currency={expense.currency} size="sm" className="text-ink-2" />
          </span>
        </span>

        <span className="shrink-0 text-right">
          {yourNet === 0 ? (
            <span className="text-[13px] text-ink-3">not involved</span>
          ) : (
            <>
              <AnimatedAmount minor={Math.abs(yourNet)} currency={expense.currency} size="md"
                tone={yourNet > 0 ? 'positive' : 'negative'} className="font-semibold" />
              <span className="block text-[12px] text-ink-3">{yourNet > 0 ? 'you lent' : 'you owe'}</span>
            </>
          )}
        </span>
      </span>

      <SplitBar shares={shares} people={group.members} height={4} currency={expense.currency}
        className="ml-[54px] mt-2.5 opacity-80 transition-opacity group-hover:opacity-100" />
    </Link>
  )
}
