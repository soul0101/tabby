import { AuthGate } from '@/components/AuthGate'
import { AddExpensePage } from '@/components/ExpensePages'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AuthGate><AddExpensePage groupId={id} /></AuthGate>
}
