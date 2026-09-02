import { AuthGate } from '@/components/AuthGate'
import { Home } from '@/components/Home'

export default function Page() {
  return <AuthGate><Home /></AuthGate>
}
