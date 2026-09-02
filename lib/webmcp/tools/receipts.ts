import { useApp } from '@/lib/store'
import * as repo from '@/lib/repo'
import type { ToolDef } from '@/lib/webmcp/useWebMcpTool'
import { resolveGroup, requireExpense } from '@/lib/webmcp/shared'

/**
 * Tier 4 — the perception bridge.
 *
 * The page holds the photo; the agent reads it with its own vision and posts
 * the structure back through `itemise_expense`. Tabby never runs OCR and the
 * agent never computes a split. Each side does the thing it is good at.
 */
export const receiptTools: ToolDef[] = [
  {
    name: 'list_receipts',
    description:
      'Expenses that have a receipt photo attached but haven’t been split line by line yet. ' +
      'Start here when someone asks you to sort out a bill from its receipt.',
    inputSchema: {
      type: 'object',
      properties: { groupId: { type: 'string' } },
    },
    execute: (args) => {
      const group = resolveGroup(args.groupId)
      const rows = useApp.getState().expenses.filter(
        (e) => e.groupId === group.id && e.receiptPath,
      )
      return {
        group: group.name,
        withReceipts: rows.length,
        expenses: rows.map((e) => ({
          expenseId: e.id,
          description: e.description,
          date: e.occurredAt.slice(0, 10),
          alreadyItemised: e.splitMode === 'items',
        })),
        next: 'Call read_receipt with an expenseId to see the photo.',
      }
    },
  },
  {
    name: 'read_receipt',
    description:
      'The receipt photo for an expense, so you can read it yourself. Then call itemise_expense with ' +
      'the lines you can see. If a line is illegible or you can’t tell who it was for, say so rather ' +
      'than guessing — it’s someone’s money.',
    inputSchema: {
      type: 'object',
      properties: { expenseId: { type: 'string' } },
      required: ['expenseId'],
    },
    execute: async (args) => {
      const e = requireExpense(args.expenseId)
      if (!e.receiptPath) throw new Error(`“${e.description}” has no receipt attached.`)
      const group = resolveGroup(e.groupId)
      const url = await repo.signReceipt(e.receiptPath, 300)

      // Image content blocks where the client takes them; the signed URL is
      // the fallback for clients that don't.
      return {
        expenseId: e.id,
        description: e.description,
        currency: e.currency,
        people: group.members.map((m) => m.name),
        imageUrl: url,
        content: [{ type: 'image', mimeType: 'image/jpeg', url }],
        next: 'Call itemise_expense with the lines, then assign_items for who had what.',
      }
    },
  },
]

/**
 * Attaching, kept apart from reading.
 *
 * The read tools appear only once a receipt exists, which is right — there is
 * nothing to look at otherwise. This one has to be there *before* that, or the
 * tool for putting a photo on a bill is only offered once the bill already has
 * one.
 */
export const receiptWriteTools: ToolDef[] = [
  {
    name: 'attach_receipt',
    description:
      'Put a photo of the bill on an expense that already exists, so everyone in the group can check ' +
      'the split against the paper. Pass the image as a data: URL when the user has given you one, or ' +
      'an https: URL it can be fetched from. This writes straight away rather than proposing — a photo ' +
      'changes nothing about what anyone owes. ' +
      'For a bill that isn’t in Tabby yet, don’t use this: send the photo as `receipt` on add_expense, ' +
      'so it arrives with the expense instead of needing a second step after someone accepts. ' +
      'If you cannot produce the image at all, say so once and move on — a person can attach it from ' +
      'the app in two taps, and the split does not wait on it.',
    inputSchema: {
      type: 'object',
      properties: {
        expenseId: { type: 'string' },
        image: {
          type: 'string',
          description: 'data:image/jpeg;base64,… or https://… — a JPEG or PNG of the receipt.',
        },
      },
      required: ['expenseId', 'image'],
    },
    execute: async (args) => {
      const e = requireExpense(args.expenseId)
      const image = String(args.image ?? '').trim()
      if (!/^(data:image\/|https?:\/\/)/i.test(image)) {
        throw new Error(
          'image must be a data: URL of the photo, or an https: URL it can be fetched from.')
      }
      if (e.receiptPath) {
        throw new Error(
          `“${e.description}” already has a receipt. Ask before replacing someone else's.`)
      }
      await useApp.getState().replaceReceipt(e.id, e.groupId, image)
      return { attached: e.description, note: 'Everyone in the group can see it now.' }
    },
  },
]
