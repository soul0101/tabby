import { AuthGate } from '@/components/AuthGate'
import { ExpenseDetail } from '@/components/ExpenseDetail'

export default async function Page({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params
  return <AuthGate><ExpenseDetail groupId={id} expenseId={eid} /></AuthGate>
}
