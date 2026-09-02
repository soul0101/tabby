'use client'
import { Shell } from '@/components/Shell'
import { ScenarioPicker } from '@/components/ScenarioPicker'

export function TryPage() {
  return (
    <Shell back={{ href: '/', label: 'Groups' }}
      title={<span className="text-[15px] font-semibold">Scenarios</span>}>
      <ScenarioPicker />
    </Shell>
  )
}
