import { AuthGate } from '@/components/AuthGate'
import { TryPage } from '@/components/TryPage'

export default function Page() {
  return <AuthGate><TryPage /></AuthGate>
}
