'use client'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { signReceipt } from '@/lib/repo'

/**
 * Receipts live in a private bucket, so the stored value is a path, not
 * something a browser can load. This swaps it for a short-lived signed URL and
 * caches the result — reopening an expense shouldn't re-sign every time.
 */
const cache = new Map<string, { url: string; expires: number }>()

export function useSignedReceipt(path: string | null | undefined) {
  const [state, setState] = useState<{ url: string | null; error: string | null; loading: boolean }>(
    { url: null, error: null, loading: Boolean(path) },
  )

  useEffect(() => {
    if (!path) { setState({ url: null, error: null, loading: false }); return }

    const hit = cache.get(path)
    if (hit && hit.expires > Date.now()) {
      setState({ url: hit.url, error: null, loading: false })
      return
    }

    let cancelled = false
    setState({ url: null, error: null, loading: true })
    signReceipt(path)
      .then((url) => {
        // Expire our copy well before the signature does.
        cache.set(path, { url, expires: Date.now() + 50 * 60 * 1000 })
        if (!cancelled) setState({ url, error: null, loading: false })
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ url: null, error: e.message, loading: false })
      })
    return () => { cancelled = true }
  }, [path])

  return state
}

/**
 * The bill, full size, over the page.
 *
 * Checking a split against the paper means looking from one to the other, so
 * this stays on top of the expense rather than replacing it — a new tab loses
 * your place and, on a phone, is a different app entirely.
 */
export function ReceiptLightbox({
  url, alt, onClose,
}: { url: string; alt: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // The page behind mustn't scroll under the photo.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm animate-[fade_.15s_ease-out]"
    >
      <div className="relative max-h-full" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url} alt={alt}
          className="max-h-[88vh] w-auto max-w-full rounded-[14px] shadow-2xl animate-[lift_.18s_ease-out]"
        />
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={onClose} autoFocus
            className="rounded-full bg-white/95 px-4 py-2 text-[14px] font-semibold text-ink shadow-lg hover:bg-white"
          >
            Close
          </button>
          <a
            href={url} target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-full bg-white/15 px-4 py-2 text-[14px] font-semibold text-white/90 hover:bg-white/25"
          >
            Open original
          </a>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** A thumbnail that opens the bill over the page. */
export function ReceiptThumb({
  path, alt, size = 44,
}: { path: string; alt: string; size?: number }) {
  const { url, loading } = useSignedReceipt(path)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  if (loading || !url) {
    return (
      <div
        style={{ width: size, height: Math.round(size * 1.33) }}
        className="animate-pulse rounded-[7px] bg-sunken"
        aria-hidden="true"
      />
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`${alt} — view full size`}
        style={{ width: size, height: Math.round(size * 1.33) }}
        className="overflow-hidden rounded-[7px] border border-line transition-transform hover:scale-105"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="h-full w-full object-cover" />
      </button>
      {open && <ReceiptLightbox url={url} alt={alt} onClose={close} />}
    </>
  )
}

export function ReceiptCard({ path, alt }: { path: string; alt: string }) {
  const { url, error, loading } = useSignedReceipt(path)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-[13px] border border-line p-2.5">
        <div className="h-[72px] w-[54px] animate-pulse rounded-[9px] bg-sunken" />
        <span className="text-[13.5px] text-ink-3">Loading receipt…</span>
      </div>
    )
  }

  if (error || !url) {
    return (
      <div className="flex items-center gap-3 rounded-[13px] border border-line p-2.5" role="alert">
        <div className="grid h-[72px] w-[54px] place-items-center rounded-[9px] bg-sunken text-[18px]" aria-hidden="true">
          📄
        </div>
        <span className="text-[13.5px] text-ink-2">
          Receipt couldn’t be loaded.{' '}
          <span className="text-ink-3">{error ?? 'It may have been removed.'}</span>
        </span>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-[13px] border border-line p-2.5 text-left transition-colors hover:bg-canvas"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url} alt={alt} width={54} height={72} loading="lazy"
          className="h-[72px] w-[54px] rounded-[9px] border border-line object-cover"
        />
        <span className="text-[13.5px] text-ink-2">Receipt attached · tap to see the bill</span>
      </button>
      {open && <ReceiptLightbox url={url} alt={alt} onClose={close} />}
    </>
  )
}
