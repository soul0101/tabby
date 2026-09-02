'use client'
import { useEffect } from 'react'
import { useCallLog } from './log'
import { useAgentActivity } from './activity'

export interface ToolDef {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  /** Marks a tool that moves money or destroys data. */
  destructive?: boolean
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

interface ModelContextLike {
  registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => Promise<void> | void
}

declare global {
  interface Document { modelContext?: ModelContextLike }
  interface Navigator { modelContext?: ModelContextLike }
}

/**
 * The spec moved `modelContext` from `navigator` to `document` during the
 * origin trial and shipped clients disagree, so prefer the current location
 * and fall back to the old one.
 */
export function getModelContext(): ModelContextLike | null {
  if (typeof document === 'undefined') return null
  const d = (document as unknown as { modelContext?: ModelContextLike }).modelContext
  const n = (navigator as unknown as { modelContext?: ModelContextLike }).modelContext
  return d ?? n ?? null
}

export const hasWebMcp = () => getModelContext() !== null

function wrap(tool: ToolDef) {
  return async (args: Record<string, unknown> = {}) => {
    const started = performance.now()
    const push = useCallLog.getState().push
    const activity = useAgentActivity.getState()
    activity.begin(tool.name)
    try {
      const result = await tool.execute(args ?? {})
      push({
        ts: Date.now(), tool: tool.name, args, result,
        ms: Math.round(performance.now() - started), ok: true,
      })
      activity.end()
      return {
        content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      push({ ts: Date.now(), tool: tool.name, args, result: message, ms: 0, ok: false })
      activity.end()
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  }
}



/**
 * Registers tools for as long as the component is mounted and `enabled` holds.
 *
 * Unregistration goes through the AbortController the spec provides, which is
 * what lets Tabby's surface change with app state — there is no way to settle
 * up in a group you haven't opened.
 */
export function useWebMcpTools(tools: ToolDef[], deps: unknown[] = [], enabled = true) {
  useEffect(() => {
    if (!enabled) return
    if (!getModelContext()) return
    const controller = new AbortController()

    for (const tool of tools) {
      const descriptor = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
        // MCP's own hints, so a client can tell a read from a write before
        // calling it.
        annotations: {
          destructiveHint: Boolean(tool.destructive),
          readOnlyHint: !tool.destructive,
        },
        execute: wrap(tool),
      }

      // The spec's call. `document` is where modelContext lives now; the
      // fallback is for clients still on the origin-trial location.
      if (document.modelContext) {
        void document.modelContext.registerTool(descriptor, { signal: controller.signal })
      } else if (navigator.modelContext) {
        void navigator.modelContext.registerTool(descriptor, { signal: controller.signal })
      }
    }

    // Aborting unregisters them, which is how the surface changes with state.
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])
}
