import { AuthGate } from '@/components/AuthGate'
import { JoinScreen } from '@/components/JoinScreen'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <AuthGate><JoinScreen token={token} /></AuthGate>
}
