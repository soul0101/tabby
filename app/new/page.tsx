import { AuthGate } from '@/components/AuthGate'
import { NewGroupPage } from '@/components/NewGroupPage'

export default function Page() {
  return <AuthGate><NewGroupPage /></AuthGate>
}
