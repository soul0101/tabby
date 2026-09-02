'use client'
import { useRef, useState } from 'react'
import { downscale } from '@/lib/image'
import { Button, Label } from '@/components/ui'

export function ReceiptField({
  value, onChange,
}: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const take = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setBusy(true); setError(null)
    try {
      onChange(await downscale(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That photo couldn’t be added.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Label>Receipt</Label>
      <input
        ref={input} type="file" accept="image/*" capture="environment" className="sr-only"
        aria-label="Receipt photo"
        onChange={(e) => { void take(e.target.files); e.target.value = '' }}
      />

      {value ? (
        <div className="mt-2 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Attached receipt" width={92} height={124}
            className="h-[124px] w-[92px] rounded-[11px] border border-line object-cover" />
          <div className="grid gap-2">
            <p className="text-[13.5px] text-ink-2">Attached. Add the lines below and tap who had what.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => input.current?.click()}>Replace</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void take(e.dataTransfer.files) }}
          className="mt-2 flex w-full items-center gap-3 rounded-[13px] border border-dashed px-4 py-3.5 text-left transition-colors"
          style={{
            borderColor: dragging ? 'var(--color-ink)' : 'var(--color-line-2)',
            background: dragging ? 'var(--color-sunken)' : 'transparent',
          }}
        >
          <span aria-hidden="true" className="emoji grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-sunken text-[16px]">
            📷
          </span>
          <span>
            <span className="block text-[14px] font-semibold">{busy ? 'Adding…' : 'Add a photo of the receipt'}</span>
            <span className="block text-[13px] text-ink-2">Optional — handy for splitting line by line</span>
          </span>
        </button>
      )}
      {error && <p role="alert" className="mt-1.5 text-[13px] text-negative">{error}</p>}
    </div>
  )
}
