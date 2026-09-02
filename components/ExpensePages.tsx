'use client'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { seatOf } from '@/lib/me'
import { Shell } from '@/components/Shell'
import { Button, Card, EmptyState } from '@/components/ui'
import { ExpenseForm, type SubmitPayload } from '@/components/ExpenseForm'
import { toast } from '@/components/Toast'

function useGroup(groupId: string) {
  const groups = useApp((s) => s.groups)
  const you = useApp((s) => s.you)
  const status = useApp((s) => s.status)
  const group = useMemo(() => groups.find((g) => g.id === groupId), [groups, groupId])
  const me = useMemo(() => (group ? seatOf(group, you) : null), [group, you])
  return { group, me, status }
}

function Loading({ back }: { back: string }) {
  return (
    <Shell back={{ href: back, label: 'Back' }}>
      <div className="grid gap-3">
        <div className="h-24 animate-pulse rounded-[16px] bg-sunken" />
        <div className="h-12 animate-pulse rounded-[12px] bg-sunken" />
        <div className="h-40 animate-pulse rounded-[16px] bg-sunken" />
      </div>
    </Shell>
  )
}

export function AddExpensePage({ groupId }: { groupId: string }) {
  const { group, me, status } = useGroup(groupId)
  const addExpense = useApp((s) => s.addExpense)
  const deleteExpense = useApp((s) => s.deleteExpense)
  const router = useRouter()
  const back = `/g/${groupId}`

  if (status === 'loading') return <Loading back={back} />
  if (!group) {
    return (
      <Shell back={{ href: '/', label: 'Groups' }}>
        <Card><EmptyState title="Group not found" body="It may have been deleted." /></Card>
      </Shell>
    )
  }

  const submit = async (p: SubmitPayload) => {
    const id = await addExpense({ groupId, ...p })
    router.push(back)
    toast(`Added “${p.description}”`, {
      tone: 'success',
      undo: async () => { await deleteExpense(id); toast('Removed again') },
    })
  }

  return (
    <Shell back={{ href: back, label: group.name }} title={<span className="text-[15px] font-semibold">Add an expense</span>}>
      <ExpenseForm group={group} me={me} onCancel={() => router.push(back)} onSubmit={submit} cta="Add expense" />
    </Shell>
  )
}

export function EditExpensePage({ groupId, expenseId }: { groupId: string; expenseId: string }) {
  const { group, me, status } = useGroup(groupId)
  const expense = useApp((s) => s.expenses.find((e) => e.id === expenseId))
  const updateExpense = useApp((s) => s.updateExpense)
  const replaceReceipt = useApp((s) => s.replaceReceipt)
  const router = useRouter()
  const back = `/g/${groupId}/e/${expenseId}`

  if (status === 'loading') return <Loading back={back} />
  if (!group || !expense) {
    return (
      <Shell back={{ href: `/g/${groupId}`, label: 'Back' }}>
        <Card><EmptyState title="Expense not found" body="It may have been deleted." /></Card>
      </Shell>
    )
  }

  const submit = async (p: SubmitPayload) => {
    if (p.receiptDataUrl) await replaceReceipt(expense.id, groupId, p.receiptDataUrl)
    await updateExpense(expense.id, {
      description: p.description, payerId: p.payerId, category: p.category,
      occurredAt: p.occurredAt, participants: p.participants, splitMode: p.splitMode,
      totalMinor: p.totalMinor, weights: p.weights, exact: p.exact, items: p.items,
      taxMinor: p.taxMinor, tipMinor: p.tipMinor,
    })
    router.push(back)
    toast('Expense updated', { tone: 'success' })
  }

  return (
    <Shell back={{ href: back, label: 'Back' }} title={<span className="text-[15px] font-semibold">Edit expense</span>}>
      <ExpenseForm group={group} me={me} existing={expense}
        onCancel={() => router.push(back)} onSubmit={submit} cta="Save changes" />
    </Shell>
  )
}
