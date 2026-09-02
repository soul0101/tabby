import { AuthGate } from '@/components/AuthGate'
import { EditExpensePage } from '@/components/ExpensePages'

export default async function Page({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params
  return <AuthGate><EditExpensePage groupId={id} expenseId={eid} /></AuthGate>
}
