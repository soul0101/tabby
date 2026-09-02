import { AuthGate } from '@/components/AuthGate'
import { GroupScreen } from '@/components/GroupScreen'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AuthGate><GroupScreen groupId={id} /></AuthGate>
}
