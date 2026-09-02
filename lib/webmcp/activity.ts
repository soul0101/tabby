'use client'
import { create } from 'zustand'

/**
 * What the agent is doing, right now, so the page can show it.
 *
 * Without this an agent's work is invisible: values change and nobody can tell
 * whether a person or a model did it. Every tool call publishes here, and the
 * UI reads it to light up the things being touched.
 */
interface AgentActivity {
  /** The tool currently executing, if any. */
  running: string | null
  /** A human-readable line about what's happening. */
  narration: string | null
  /** Ids the agent has just touched, with when. Drives the highlight ring. */
  touched: Record<string, number>
  /** Per-id money deltas, shown as a badge that fades. */
  deltas: Record<string, number>

  begin: (tool: string, narration?: string) => void
  end: () => void
  touch: (ids: string | string[], stagger?: number) => void
  delta: (map: Record<string, number>) => void
}

const LIFETIME = 2600

export const useAgentActivity = create<AgentActivity>((set, get) => ({
  running: null,
  narration: null,
  touched: {},
  deltas: {},

  begin: (tool, narration) => set({ running: tool, narration: narration ?? null }),
  end: () => set({ running: null, narration: null }),

  /**
   * Marks ids as agent-touched. A stagger makes a batch land one after another,
   * which is what turns "twelve rows changed" into something you can follow.
   */
  touch: (ids, stagger = 0) => {
    const list = Array.isArray(ids) ? ids : [ids]
    list.forEach((id, i) => {
      const apply = () => {
        set((s) => ({ touched: { ...s.touched, [id]: Date.now() } }))
        setTimeout(() => {
          set((s) => {
            const next = { ...s.touched }
            const d = { ...s.deltas }
            delete next[id]
            delete d[id]
            return { touched: next, deltas: d }
          })
        }, LIFETIME)
      }
      if (stagger > 0 && i > 0) setTimeout(apply, i * stagger)
      else apply()
    })
  },

  delta: (map) => set((s) => ({ deltas: { ...s.deltas, ...map } })),
}))

/** Was this id touched by the agent in the last couple of seconds? */
export const useTouched = (id: string | null | undefined) =>
  useAgentActivity((s) => (id ? Boolean(s.touched[id]) : false))

export const useDelta = (id: string | null | undefined) =>
  useAgentActivity((s) => (id ? s.deltas[id] ?? null : null))
