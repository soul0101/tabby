import { AuthGate } from '@/components/AuthGate'
import { YouPage } from '@/components/YouPage'

export default function Page() {
  return <AuthGate><YouPage /></AuthGate>
}
