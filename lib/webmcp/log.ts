'use client'
import { create } from 'zustand'

export interface CallLogEntry {
  id: string
  ts: number
  tool: string
  args: unknown
  result: unknown
  ms: number
  ok: boolean
}

interface LogState {
  entries: CallLogEntry[]
  open: boolean
  push: (e: Omit<CallLogEntry, 'id'>) => void
  clear: () => void
  toggle: () => void
}

export const useCallLog = create<LogState>((set) => ({
  entries: [],
  open: false,
  push: (e) =>
    set((s) => ({
      entries: [{ ...e, id: `${e.ts}-${Math.random().toString(36).slice(2, 7)}` }, ...s.entries].slice(0, 60),
    })),
  clear: () => set({ entries: [] }),
  toggle: () => set((s) => ({ open: !s.open })),
}))
