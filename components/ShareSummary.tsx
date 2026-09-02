'use client'
import { useMemo, useState } from 'react'
import { tripSummary } from '@/lib/summary'
import type { Expense, Group, Settlement } from '@/lib/types'
import { Button, Label } from '@/components/ui'
import { toast } from '@/components/Toast'

export function ShareSummary({
  group, expenses, settlements, me, onClose,
}: {
  group: Group
  expenses: Expense[]
  settlements: Settlement[]
  me: string | null
  onClose: () => void
}) {
  const text = useMemo(
    () => tripSummary(group, expenses, settlements, me),
    [group, expenses, settlements, me],
  )
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast('Copied to clipboard', { tone: 'success' })
      setTimeout(() => setCopied(false), 2200)
    } catch {
      toast('Couldn’t copy — select the text and copy it manually', { tone: 'error' })
    }
  }

  const share = async () => {
    try {
      await navigator.share({ title: group.name, text })
    } catch {
      // The user dismissed the sheet, or the browser can't share. Not an error.
    }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <section className="card p-4 sm:p-5" aria-label="Trip summary">
      <div className="flex items-baseline justify-between gap-3">
        <Label as="h2">Share the summary</Label>
        <Button size="sm" variant="ghost" onClick={onClose}>Hide</Button>
      </div>
      <p className="mt-1 text-[13px] text-ink-3 text-pretty">
        Drop this in the group chat so everyone knows what they owe.
      </p>
      <pre className="mt-3 whitespace-pre-wrap rounded-[12px] bg-canvas p-3.5 text-[13px] leading-relaxed text-ink">
        {text}
      </pre>
      <div className="mt-3 flex gap-2.5">
        {canShare && <Button className="flex-1" onClick={() => void share()}>Share…</Button>}
        <Button className="flex-1" variant="primary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy text'}
        </Button>
      </div>
    </section>
  )
}
