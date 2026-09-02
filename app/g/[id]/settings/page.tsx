import { AuthGate } from '@/components/AuthGate'
import { GroupSettingsPage } from '@/components/GroupSettings'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AuthGate><GroupSettingsPage groupId={id} /></AuthGate>
}
