import { useApp } from '@/lib/store'
import * as repo from '@/lib/repo'
import { computeShares, totalOf } from '@/lib/split'
import { minTransfers, netBalances } from '@/lib/settle'
import { toMinor, formatMinor } from '@/lib/money'
import { CATEGORIES, type Category, type Id } from '@/lib/types'
import { useAgentActivity } from '@/lib/webmcp/activity'
import type { Patch } from '@/lib/types'
import type { ToolDef } from '@/lib/webmcp/useWebMcpTool'
import { money, resolveGroup, meSeat, nameIn, requireExpense, resolvePeople } from '@/lib/webmcp/shared'

/**
 * Tier 3 — writing.
 *
 * The division of labour: the agent supplies facts it observed (a bill was
 * ₹4,200) and judgements a person would make (Ravi didn't eat the lamb). It
 * never computes anyone's share — `computeShares` in the page does that, so an
 * agent cannot produce an arithmetic error about someone's money.
 *
 * Anything that moves money raises a sheet in the page and blocks until a
 * human answers.
 */

/**
 * Puts a change in front of the group instead of applying it.
 *
 * A modal was the wrong surface for a decision about other people's money: it
 * is ephemeral, only the person at the screen sees it, and it leaves no record.
 * A proposal is durable, visible to everyone, and can be argued with.
 */
async function propose(
  groupId: string, expenseId: string | null, body: string, patch: Patch,
) {
  const before = useApp.getState().messages.find(
    (x) => x.groupId === groupId && x.kind === 'proposal' && x.status === 'pending'
      && x.expenseId === expenseId,
  )
  const m = await useApp.getState().propose(groupId, expenseId, body, patch)
  const amended = Boolean(before && before.id === m.id)

  // Mark where the proposal landed, not what it would change — nothing has.
  useAgentActivity.getState().touch(expenseId ?? groupId)

  const empty = m.diff && Object.keys({ ...m.diff.before, ...m.diff.after })
    .every((id) => (m.diff!.after[id] ?? 0) === (m.diff!.before[id] ?? 0))

  return {
    [amended ? 'amended' : 'proposed']: true,
    proposalId: m.id,
    headline: m.diff?.headline,
    ...(amended && { soFar: m.revisions.map((r) => r.body) }),
    ...(empty && {
      warning: 'As it stands this wouldn’t change anyone’s share. Check you meant '
        + 'something different from what the bill already says.',
    }),
    status: 'waiting for someone in the group to accept it',
    note: amended
      ? 'Folded into the change already waiting on this bill. Nothing is saved until someone accepts it.'
      : 'Nothing has changed yet. It’s in the expense’s discussion for anyone to accept or decline.',
  }
}

const preview = (groupId: Id, expenseId: Id) => {
  const e = requireExpense(expenseId)
  const group = resolveGroup(groupId)
  return {
    expenseId: e.id,
    total: money(totalOf(e)),
    owes: Object.entries(computeShares(e)).map(([id, v]) => ({
      person: nameIn(group, id), amount: money(v),
    })),
  }
}

export const writeTools: ToolDef[] = [
  {
    name: 'add_expense',
    description:
      'Propose adding an expense. You give the total that was paid and who was involved; the page works ' +
      'out what each person owes — never send per-person amounts. This does not save anything: it posts ' +
      'a proposal to the group’s discussion, with a diff, that someone has to accept. ' +
      'Working from a photo of a bill? Send `lines` — everything you can read off it — in this one ' +
      'call, and `receipt` too if you happen to hold the image. Never let a missing photo stop you ' +
      'entering the bill. Don’t propose a bare total and then try to attach a photo afterwards: ' +
      'nothing is saved until someone accepts, so there is no expense to attach it to yet.',
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'e.g. "Dinner at Ritz Classic"' },
        amount: { type: 'number', description: 'The bill total, in major units (4200.50).' },
        paidBy: { type: 'string', description: 'Who paid. A name, or "me". Defaults to the user.' },
        splitBetween: {
          type: 'array', items: { type: 'string' },
          description: 'Names. Defaults to everyone in the group.',
        },
        category: { type: 'string', enum: [...CATEGORIES] },
        date: { type: 'string', description: 'ISO date. Defaults to today.' },
        currency: { type: 'string', description: 'If it was paid in another currency, e.g. THB.' },
        rate: { type: 'number', description: 'Units of the group currency per unit of `currency`.' },
        receipt: {
          type: 'string',
          description:
            'Optional. A photo of the bill as a data:image/… or https: URL, which rides along with ' +
            'the proposal and lands on the expense when it is accepted. ' +
            'Only send it if you already hold the bytes or a URL. If you were shown a picture you ' +
            'cannot re-encode — a file the person attached to the chat, say — do not stop and do ' +
            'not ask for it: send `lines` from what you can read, and mention that the photo can be ' +
            'attached from the app. The line items are the valuable part.',
        },
        lines: {
          type: 'array',
          description:
            'The bill line by line, if you can read it. Sending these with the expense means one ' +
            'proposal instead of two — the person accepts a complete bill rather than a bare total.',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, amount: { type: 'number' } },
            required: ['label', 'amount'],
          },
        },
        tax: { type: 'number', description: 'Tax as printed. Only with `lines`.' },
        tip: { type: 'number', description: 'Service or tip as printed. Only with `lines`.' },
        groupId: { type: 'string' },
      },
      required: ['description', 'amount'],
    },
    execute: async (args) => {
      const group = resolveGroup(args.groupId)
      const s = useApp.getState()
      const me = meSeat(group)

      if (typeof args.amount !== 'number' || !Number.isFinite(args.amount) || args.amount <= 0) {
        throw new Error('amount must be a positive number in major units, e.g. 4200.50.')
      }
      const payerId = args.paidBy
        ? resolvePeople([args.paidBy], group, 'paidBy')[0]
        : me ?? group.members[0].id
      const participants = args.splitBetween
        ? resolvePeople(args.splitBetween, group, 'splitBetween')
        : group.members.map((m) => m.id)
      if (participants.length === 0) throw new Error('splitBetween needs at least one person.')

      const currency = args.currency ? String(args.currency).toUpperCase() : group.currency
      const rate = currency === group.currency ? 1 : Number(args.rate)
      if (currency !== group.currency && (!Number.isFinite(rate) || rate <= 0)) {
        throw new Error(`Paying in ${currency} needs a \`rate\`: how many ${group.currency} one ${currency} is worth.`)
      }

      const totalMinor = toMinor(args.amount)
      const perHead = Math.round(totalMinor / participants.length)

      // Line items, if the model could read them. Everyone is still on an equal
      // share until somebody says who had what — listing the bill doesn't
      // divide it.
      const rawLines = Array.isArray(args.lines) ? args.lines : []
      const items = rawLines.map((l) => {
        const line = l as { label?: unknown; amount?: unknown }
        const amount = Number(line.amount)
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(`Every line needs a positive amount — “${String(line.label)}” doesn't have one.`)
        }
        return { id: crypto.randomUUID(), label: String(line.label ?? '').trim(), amountMinor: toMinor(amount), eatenBy: participants }
      })
      if (items.some((i) => !i.label)) throw new Error('Every line needs a label.')

      // The photo goes to storage now. That saves no expense and moves no
      // money — it just means the bytes are somewhere the group can reach
      // when the proposal is accepted, rather than sitting in a chat window.
      let receiptPath: string | undefined
      const receipt = typeof args.receipt === 'string' ? args.receipt.trim() : ''
      if (receipt) {
        if (!/^(data:image\/|https?:\/\/)/i.test(receipt)) {
          throw new Error('receipt must be a data: URL of the photo, or an https: URL.')
        }
        receiptPath = await repo.uploadReceipt(group.id, receipt)
      }

      return propose(
        group.id, null,
        `Add “${args.description}” — ${formatMinor(totalMinor, currency)}, ${nameIn(group, payerId)} paid, about ${formatMinor(perHead, currency)} each`,
        {
          kind: 'add_expense',
          input: {
            description: String(args.description),
            payerId,
            totalMinor,
            participants,
            // With every line shared by everyone this comes to the same
            // per-head number as an equal split, but it says the bill is
            // itemised, so the lines are visible and can be assigned later.
            splitMode: items.length > 0 ? 'items' : 'equal',
            category: (args.category as Category) ?? 'other',
            occurredAt: args.date ? new Date(`${args.date}T12:00:00`).toISOString() : undefined,
            currency,
            fxRate: rate,
            ...(items.length > 0
              ? {
                  items,
                  taxMinor: toMinor(Number(args.tax ?? 0)),
                  tipMinor: toMinor(Number(args.tip ?? 0)),
                }
              : {}),
            ...(receiptPath ? { receiptPath } : {}),
          },
        },
      )
    },
  },
  {
    name: 'itemise_expense',
    description:
      'Turn an expense into a line-by-line bill. Send the lines you can see on the receipt; leave ' +
      '`hadBy` off anything shared. The page recomputes everyone’s share — do not send per-person amounts.',
    inputSchema: {
      type: 'object',
      properties: {
        expenseId: { type: 'string' },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              amount: { type: 'number', description: 'Major units.' },
              hadBy: { type: 'array', items: { type: 'string' }, description: 'Names. Omit if shared.' },
            },
            required: ['label', 'amount'],
          },
        },
        tax: { type: 'number' },
        tip: { type: 'number' },
      },
      required: ['expenseId', 'lines'],
    },
    execute: async (args) => {
      const e = requireExpense(args.expenseId)
      const group = resolveGroup(e.groupId)
      const raw = Array.isArray(args.lines) ? args.lines : []
      if (raw.length === 0) throw new Error('Send at least one line.')

      const items = raw.map((r, i) => {
        const line = r as Record<string, unknown>
        if (typeof line.amount !== 'number' || !Number.isFinite(line.amount)) {
          throw new Error(`Line ${i + 1} ("${line.label}") needs a numeric amount in major units.`)
        }
        return {
          id: `i_${i}_${Math.random().toString(36).slice(2, 6)}`,
          label: String(line.label ?? `Item ${i + 1}`),
          amountMinor: toMinor(line.amount),
          eatenBy: line.hadBy ? resolvePeople(line.hadBy, group, 'hadBy') : [],
        }
      })
      const taxMinor = typeof args.tax === 'number' ? toMinor(args.tax) : 0
      const tipMinor = typeof args.tip === 'number' ? toMinor(args.tip) : 0

      await useApp.getState().updateExpense(
        e.id,
        { splitMode: 'items', items, taxMinor, tipMinor },
        `Itemised from the receipt — ${items.length} lines.`,
      )
      useAgentActivity.getState().touch(items.map((i) => i.id), 70)
      return { itemised: items.length, ...preview(e.groupId, e.id) }
    },
  },
  {
    name: 'assign_items',
    description:
      'Propose who had which line items on an itemised bill. You choose the people; the page decides ' +
      'the money. Pass an empty `hadBy` to mark a line as shared by everyone. The `reason` becomes the ' +
      'proposal’s title, so write it for the people who will read it — "Ravi is vegetarian, off the ' +
      'meat" rather than "updated assignments". Nothing changes until someone accepts.\n\n' +
      'If a change is already waiting on this bill, yours is folded into it rather than replacing it — ' +
      'so send only the lines you want to change on top, not the whole bill again. Call ' +
      'explain_expense first to see what’s already suggested.',
    inputSchema: {
      type: 'object',
      properties: {
        expenseId: { type: 'string' },
        assignments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string', description: 'From explain_expense.' },
              hadBy: { type: 'array', items: { type: 'string' } },
            },
            required: ['itemId', 'hadBy'],
          },
        },
        reason: { type: 'string', description: 'e.g. "Ravi is vegetarian — off the meat."' },
      },
      required: ['expenseId', 'assignments'],
    },
    execute: async (args) => {
      const e = requireExpense(args.expenseId)
      if (e.splitMode !== 'items') {
        throw new Error(`“${e.description}” isn’t itemised. Call itemise_expense first.`)
      }
      const group = resolveGroup(e.groupId)
      const valid = new Set((e.items ?? []).map((i) => i.id))
      const raw = Array.isArray(args.assignments) ? args.assignments : []

      // Validate the whole batch before applying any of it, so a bad line
      // can't leave the bill half-assigned.
      const parsed = raw.map((a) => {
        const rec = a as Record<string, unknown>
        const itemId = String(rec.itemId)
        if (!valid.has(itemId)) {
          throw new Error(`"${itemId}" isn’t a line on this expense. Call explain_expense for the ids.`)
        }
        return { itemId, people: resolvePeople(rec.hadBy ?? [], group, 'hadBy') }
      })

      return propose(
        e.groupId, e.id,
        args.reason ? String(args.reason) : `Change who had ${parsed.length} item${parsed.length > 1 ? 's' : ''}`,
        { kind: 'assign_items', expenseId: e.id, assignments: parsed.map((p) => ({ itemId: p.itemId, hadBy: p.people })) },
      )
    },
  },
  {
    name: 'update_expense',
    description:
      'Propose a change to an expense — its description, total, category, date, who paid, who it’s ' +
      'split between. Posts a proposal with a diff; nothing changes until someone accepts.',
    inputSchema: {
      type: 'object',
      properties: {
        expenseId: { type: 'string' },
        description: { type: 'string' },
        amount: { type: 'number', description: 'Major units.' },
        paidBy: { type: 'string' },
        splitBetween: { type: 'array', items: { type: 'string' } },
        category: { type: 'string', enum: [...CATEGORIES] },
        date: { type: 'string' },
        reason: { type: 'string', description: 'Saved on the expense as a note.' },
      },
      required: ['expenseId'],
    },
    execute: async (args) => {
      const e = requireExpense(args.expenseId)
      const group = resolveGroup(e.groupId)
      const patch: Record<string, unknown> = {}

      if (args.description) patch.description = String(args.description)
      if (args.category) patch.category = args.category
      if (args.date) patch.occurredAt = new Date(`${args.date}T12:00:00`).toISOString()
      if (args.paidBy) patch.payerId = resolvePeople([args.paidBy], group, 'paidBy')[0]
      if (args.splitBetween) {
        const people = resolvePeople(args.splitBetween, group, 'splitBetween')
        if (people.length === 0) throw new Error('splitBetween needs at least one person.')
        patch.participants = people
      }
      if (args.amount !== undefined) {
        if (typeof args.amount !== 'number' || args.amount <= 0) {
          throw new Error('amount must be a positive number in major units.')
        }
        if (e.splitMode === 'items') {
          throw new Error('This bill adds up from its line items — change those instead.')
        }
        patch.totalMinor = toMinor(args.amount)
        patch.baseTotalMinor = Math.round(toMinor(args.amount) * e.fxRate)
      }
      if (Object.keys(patch).length === 0) throw new Error('Nothing to change.')

      return propose(
        e.groupId, e.id,
        args.reason ? String(args.reason)
          : `Edit “${e.description}”`,
        { kind: 'update_expense', expenseId: e.id, fields: patch as Record<string, never> },
      )
    },
  },
  {
    name: 'delete_expense',
    description:
      'Propose removing an expense. Posts a proposal showing what it does to everyone’s balance; ' +
      'nothing is deleted until someone accepts.',
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: { expenseId: { type: 'string' } },
      required: ['expenseId'],
    },
    execute: async (args) => {
      const e = requireExpense(args.expenseId)
      const group = resolveGroup(e.groupId)
      return propose(
        e.groupId, e.id,
        `Delete “${e.description}” — ${formatMinor(totalOf(e), e.currency)}, paid by ${nameIn(group, e.payerId)}`,
        { kind: 'delete_expense', expenseId: e.id },
      )
    },
  },
  {
    name: 'settle_up',
    description:
      'Propose recording that one person paid another. Call get_balances first — the settlement plan ' +
      'there is the one to follow. Posts a proposal; nothing is recorded until someone accepts.',
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Who paid.' },
        to: { type: 'string', description: 'Who was paid.' },
        amount: { type: 'number', description: 'Major units. Omit to settle what they actually owe.' },
        groupId: { type: 'string' },
      },
      required: ['from', 'to'],
    },
    execute: async (args) => {
      const group = resolveGroup(args.groupId)
      const [from] = resolvePeople([args.from], group, 'from')
      const [to] = resolvePeople([args.to], group, 'to')
      if (from === to) throw new Error('A person can’t settle up with themselves.')

      const s = useApp.getState()
      const es = s.expenses.filter((e) => e.groupId === group.id)
      const ss = s.settlements.filter((x) => x.groupId === group.id)

      let amountMinor: number
      if (args.amount === undefined) {
        // Fall back to what the plan says these two should move.
        const planned = minTransfers(netBalances(es, ss)).find((t) => t.from === from && t.to === to)
        if (!planned) {
          throw new Error(
            `The settle-up plan doesn’t have ${nameIn(group, from)} paying ${nameIn(group, to)}. ` +
            'Call get_balances, or pass an explicit amount.',
          )
        }
        amountMinor = planned.amountMinor
      } else {
        if (typeof args.amount !== 'number' || args.amount <= 0) {
          throw new Error('amount must be a positive number in major units.')
        }
        amountMinor = toMinor(args.amount)
      }

      return propose(
        group.id, null,
        `${nameIn(group, from)} pays ${nameIn(group, to)} ${formatMinor(amountMinor, group.currency)}`,
        { kind: 'settle', from, to, amountMinor },
      )
    },
  },
  {
    name: 'withdraw_proposal',
    description:
      'Take back a change you suggested that is still waiting. Use this when you got it wrong and ' +
      'want to start over, rather than asking the group to decline something you no longer mean. ' +
      'You can only withdraw your own side’s drafts — to change one, just propose again and it ' +
      'folds in.',
    inputSchema: {
      type: 'object',
      properties: { proposalId: { type: 'string', description: 'From explain_expense.' } },
      required: ['proposalId'],
    },
    execute: async (args) => {
      const m = useApp.getState().messages.find((x) => x.id === args.proposalId)
      if (!m) throw new Error(`No proposal with id "${args.proposalId}". Call explain_expense to find it.`)
      if (m.status !== 'pending') throw new Error(`That one is already ${m.status}.`)
      await useApp.getState().withdraw(m.id)
      return { withdrawn: true, note: 'Taken back. Nothing changed, and you can propose again.' }
    },
  },
  {
    name: 'add_person',
    description:
      'Add someone to a group. Give an email address, or the name of someone the user has split ' +
      'with before (see `friends` in get_context) — those two are the normal cases. A name Tabby ' +
      'doesn’t recognise becomes a placeholder seat for somebody who doesn’t use the app, which ' +
      'they can claim later from the share link.',
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'An email address, or a name.' },
        groupId: { type: 'string', description: 'Defaults to the group on screen.' },
      },
      required: ['person'],
    },
    execute: async (args) => {
      const group = resolveGroup(args.groupId)
      const entry = String(args.person).trim()
      if (!entry) throw new Error('Give an email address, or a name.')

      const st = useApp.getState()
      const known = st.friends.find(
        (f) => f.email.toLowerCase() === entry.toLowerCase()
          || f.name.toLowerCase() === entry.toLowerCase())
      if (known) {
        if (group.members.some((m) => m.userId === known.id)) {
          throw new Error(`${known.name} is already in ${group.name}.`)
        }
        await st.addFriend(group.id, known.id)
        return { added: known.name, group: group.name, how: 'straight in — you’ve split before' }
      }

      if (entry.includes('@')) {
        await st.invite(group.id, entry.toLowerCase())
        return {
          invited: entry.toLowerCase(), group: group.name,
          note: 'Waiting on them to accept. Nothing has been shared yet.',
        }
      }

      if (group.members.some((m) => m.name.toLowerCase() === entry.toLowerCase())) {
        throw new Error(`${entry} is already in ${group.name}.`)
      }
      await st.addMember(group.id, entry)
      return {
        added: entry, group: group.name,
        how: 'a placeholder seat — they can claim it from the share link',
      }
    },
  },
  {
    name: 'invite_to_group',
    description:
      'Invite someone to a group by email address. They see the invitation next time they open ' +
      'Tabby and can accept or decline — nothing is shared with them until they accept. Use ' +
      '`seatName` when the person is already in the group by name, so they arrive owing what that ' +
      'name already owes instead of as a new person.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Their email address.' },
        seatName: {
          type: 'string',
          description: 'An existing unclaimed person in the group this invitation is for.',
        },
        groupId: { type: 'string', description: 'Defaults to the group on screen.' },
      },
      required: ['email'],
    },
    execute: async (args) => {
      const group = resolveGroup(args.groupId)
      const email = String(args.email).trim().toLowerCase()
      if (!email.includes('@')) throw new Error(`"${args.email}" is not an email address.`)

      let seat: string | null = null
      if (args.seatName) {
        const wanted = String(args.seatName).trim().toLowerCase()
        const found = group.members.find((m) => m.name.toLowerCase() === wanted)
        if (!found) {
          throw new Error(
            `There is nobody called "${args.seatName}" in ${group.name}. ` +
            `Members: ${group.members.map((m) => m.name).join(', ')}.`)
        }
        if (found.userId) throw new Error(`${found.name} has already claimed their spot.`)
        seat = found.id
      }

      await useApp.getState().invite(group.id, email, seat)
      return {
        invited: email,
        group: group.name,
        as: seat ? String(args.seatName) : 'someone new',
        note: 'Waiting on them to accept. Nothing has been shared yet.',
      }
    },
  },
  {
    name: 'respond_to_invitation',
    description:
      'Accept or decline an invitation addressed to the signed-in user. Read `invitations` from ' +
      'get_context first — joining a group means seeing everyone’s money in it, so ask before ' +
      'accepting one on someone’s behalf.',
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: {
        invitationId: { type: 'string', description: 'From get_context.' },
        accept: { type: 'boolean' },
      },
      required: ['invitationId', 'accept'],
    },
    execute: async (args) => {
      const found = useApp.getState().invites.find((i) => i.id === args.invitationId)
      if (!found) throw new Error('No invitation with that id is waiting for you.')
      await useApp.getState().answerInvite(found.id, args.accept === true)
      return args.accept === true
        ? { joined: found.groupName }
        : { declined: found.groupName }
    },
  },
  {
    name: 'delete_group',
    description:
      'Remove a group and everything in it. This is reversible — the group is marked deleted, not ' +
      'destroyed — but it disappears for everyone in it, so confirm with the user first.',
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: { groupId: { type: 'string', description: 'Defaults to the group on screen.' } },
    },
    execute: async (args) => {
      const group = resolveGroup(args.groupId)
      const count = useApp.getState().expenses.filter((e) => e.groupId === group.id).length
      await useApp.getState().deleteGroup(group.id)
      return {
        deleted: group.name,
        expensesRemoved: count,
        note: 'Reversible with restore_group while you remember the id.',
        groupId: group.id,
      }
    },
  },
  {
    name: 'restore_group',
    description: 'Bring back a group that was deleted, with its expenses and balances intact.',
    inputSchema: {
      type: 'object',
      properties: { groupId: { type: 'string' } },
      required: ['groupId'],
    },
    execute: async (args) => {
      await useApp.getState().restoreGroup(String(args.groupId))
      const back = useApp.getState().groups.find((g) => g.id === args.groupId)
      if (!back) throw new Error('That group could not be brought back.')
      return { restored: back.name }
    },
  },
  {
    name: 'restore_expense',
    description:
      'Bring back a deleted expense. It returns as the same expense — same items, same ' +
      'discussion, same place in the history.',
    inputSchema: {
      type: 'object',
      properties: { expenseId: { type: 'string' } },
      required: ['expenseId'],
    },
    execute: async (args) => {
      await useApp.getState().restoreExpense(String(args.expenseId))
      const back = useApp.getState().expenses.find((e) => e.id === args.expenseId)
      if (!back) throw new Error('That expense could not be brought back.')
      return { restored: back.description, total: money(back.totalMinor) }
    },
  },
  {
    name: 'create_group',
    description: 'Start a new group and add people to it by name.',
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        people: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Everyone except you. An email address invites that person; a name the user has ' +
            'split with before adds them straight away; any other name becomes a placeholder ' +
            'they can claim later. Prefer addresses — read `friends` from get_context first.',
        },
        emoji: { type: 'string' },
      },
      required: ['name', 'people'],
    },
    execute: async (args) => {
      const name = String(args.name).trim()
      if (!name) throw new Error('The group needs a name.')
      const raw = (Array.isArray(args.people) ? args.people : [])
        .map((p) => String(p).trim()).filter(Boolean)
      if (raw.length === 0) throw new Error('Add at least one person to split with.')

      // Sort each entry into how that person actually gets in: someone already
      // known goes straight in, an address is invited, anything else is a
      // placeholder seat.
      const friends = useApp.getState().friends
      const friendIds: Id[] = []
      const emails: string[] = []
      const names: string[] = []
      for (const entry of raw) {
        const known = friends.find(
          (f) => f.email.toLowerCase() === entry.toLowerCase()
            || f.name.toLowerCase() === entry.toLowerCase())
        if (known) friendIds.push(known.id)
        else if (entry.includes('@')) emails.push(entry.toLowerCase())
        else names.push(entry)
      }

      // A new group touches nobody's existing balance, so it doesn't need
      // the group's consent — there is no group yet.
      const id = await useApp.getState().createGroup(
        name, String(args.emoji ?? '💸'), { friendIds, emails, names })
      return {
        created: true, groupId: id, name,
        addedDirectly: friendIds.length,
        invited: emails,
        placeholders: names,
      }
    },
  },
]
