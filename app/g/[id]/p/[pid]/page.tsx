import { AuthGate } from '@/components/AuthGate'
import { PersonPage } from '@/components/PersonPage'

export default async function Page({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params
  return <AuthGate><PersonPage groupId={id} personId={pid} /></AuthGate>
}
