import { useApp } from '@/lib/store'
import type { ToolDef } from '@/lib/webmcp/useWebMcpTool'
import { resolveGroup, requireExpense } from '@/lib/webmcp/shared'

/**
 * Tier 2 — navigation.
 *
 * These change no data; they move the user's screen. When the agent talks
 * about an expense it can also point at it, which is the thing a backend
 * integration structurally cannot do.
 */
export const navTools: ToolDef[] = [
  {
    name: 'open_group',
    description: 'Show a group on screen. Accepts its name or id.',
    inputSchema: {
      type: 'object',
      properties: { group: { type: 'string' } },
      required: ['group'],
    },
    execute: (args) => {
      const group = resolveGroup(args.group)
      const s = useApp.getState()
      if (!s.navigate) throw new Error('The page isn’t ready yet — try again in a moment.')
      s.navigate(`/g/${group.id}`)
      return `Showing ${group.name}.`
    },
  },
  {
    name: 'open_view',
    description:
      'Switch the visible tab. "expenses" is the list, "balances" is who owes whom and settling up, ' +
      '"insights" is where the money went, "activity" is the history of changes.',
    inputSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['expenses', 'balances', 'insights', 'activity'] },
      },
      required: ['view'],
    },
    execute: (args) => {
      const view = args.view as 'expenses' | 'balances' | 'insights' | 'activity'
      if (!['expenses', 'balances', 'insights', 'activity'].includes(view)) {
        throw new Error('view must be expenses, balances, insights or activity.')
      }
      useApp.getState().setOpenView(view)
      return `Switched to ${view}.`
    },
  },
  {
    name: 'focus_expense',
    description:
      'Open one expense on the user’s screen. Call this whenever you refer to a specific expense so ' +
      'the person can see the one you mean.',
    inputSchema: {
      type: 'object',
      properties: { expenseId: { type: 'string' } },
      required: ['expenseId'],
    },
    execute: (args) => {
      const e = requireExpense(args.expenseId)
      const s = useApp.getState()
      if (!s.navigate) throw new Error('The page isn’t ready yet — try again in a moment.')
      // Navigate here rather than leaving it to whatever screen happens to be
      // mounted — an agent can point at an expense from anywhere in the app.
      s.navigate(`/g/${e.groupId}/e/${e.id}`)
      s.focusExpense(e.id)
      setTimeout(() => useApp.getState().focusExpense(null), 1500)
      return `Showing “${e.description}” on screen.`
    },
  },
]
