'use client'
import { create } from 'zustand'
import { useEffect } from 'react'

interface Toast {
  id: string
  message: string
  tone: 'info' | 'success' | 'error'
  /** Offering an undo is the difference between a confident app and a scary one. */
  undo?: () => void | Promise<void>
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, opts?: { tone?: Toast['tone']; undo?: Toast['undo'] }) => void
  dismiss: (id: string) => void
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  show: (message, opts) => {
    const id = `t_${Date.now()}${Math.random().toString(36).slice(2, 5)}`
    set((s) => ({ toasts: [...s.toasts, { id, message, tone: opts?.tone ?? 'info', undo: opts?.undo }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), opts?.undo ? 7000 : 4000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function Toaster() {
  const toasts = useToast((s) => s.toasts)
  const dismiss = useToast((s) => s.dismiss)

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ paddingBottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 5.5rem))' }}
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[13px] border px-4 py-3 shadow-pop"
          style={{
            animation: 'toast-in .22s cubic-bezier(.2,.9,.3,1)',
            background: t.tone === 'error' ? 'var(--color-negative-wash)' : 'var(--color-ink)',
            borderColor: t.tone === 'error' ? 'var(--color-negative)' : 'transparent',
            color: t.tone === 'error' ? 'var(--color-negative)' : 'var(--color-surface)',
          }}
        >
          <span className="min-w-0 flex-1 text-[14px] font-medium">{t.message}</span>
          {t.undo && (
            <button
              onClick={() => { void t.undo?.(); dismiss(t.id) }}
              className="shrink-0 rounded-[8px] px-2 py-1 text-[13px] font-semibold underline underline-offset-2 transition-opacity hover:opacity-75"
            >
              Undo
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded-[8px] p-1 opacity-60 transition-opacity hover:opacity-100"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

/** Escape hatch for non-React callers. */
export const toast = (message: string, opts?: Parameters<ToastState['show']>[1]) =>
  useToast.getState().show(message, opts)

export function useToastShortcut() {
  useEffect(() => {}, [])
}
