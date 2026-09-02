import { useApp } from '@/lib/store'
import { computeShares, totalOf, baseTotalOf, itemsDecided } from '@/lib/split'
import { minTransfers, netBalances, debtCount } from '@/lib/settle'
import { CATEGORY_EMOJI, type Category, type Expense } from '@/lib/types'
import type { ToolDef } from '@/lib/webmcp/useWebMcpTool'
import { money, resolveGroup, meSeat, nameIn, requireExpense, resolvePeople } from '@/lib/webmcp/shared'

/**
 * Drafts still awaiting a person, and — crucially — what the bill would look
 * like if each were accepted.
 *
 * Reporting only the saved state made an agent conclude its own correction was
 * a no-op: it saw "everyone had the mutton" because that is what is *saved*,
 * not knowing its pending draft had already taken someone off it.
 */
function pendingFor(expenseId: string, e: Expense, group: ReturnType<typeof resolveGroup>) {
  const s = useApp.getState()
  const drafts = s.messages.filter(
    (x) => x.expenseId === expenseId && x.kind === 'proposal' && x.status === 'pending',
  )
  if (drafts.length === 0) return null
  const me = meSeat(group)

  return drafts.map((m) => {
    const proposed = m.patch?.kind === 'assign_items'
      ? applyAssignments(e, m.patch.assignments)
      : null
    const yours = m.authorMember !== null && m.authorMember === me

    return {
      proposalId: m.id,
      by: yours ? 'your agent'
        : m.authorMember ? `${nameIn(group, m.authorMember)}’s agent`
        : 'an agent',
      yours,
      soFar: m.revisions.map((r) => r.body),
      effect: m.diff?.headline,
      note: yours
        ? 'This is your own draft. Anything else you propose for this bill folds into it, so send '
          + 'only the lines you want to change on top of `wouldBecome` below — not the saved bill. '
          + 'Use withdraw_proposal to take it back entirely.'
        : 'Someone else’s agent proposed this. Yours would be a separate draft; you cannot edit theirs.',
      // The bill as it would stand if this were accepted. Reason against this.
      wouldBecome: proposed
        ? {
            items: (proposed.items ?? []).map((i) => ({
              id: i.id,
              label: i.label,
              hadBy: i.eatenBy.length ? i.eatenBy.map((x) => nameIn(group, x)) : 'everyone',
            })),
            owes: Object.entries(computeShares(proposed)).map(([id, v]) => ({
              person: nameIn(group, id), amount: money(v),
            })),
          }
        : undefined,
    }
  })
}

/** The expense as a set of assignments would leave it, without saving anything. */
function applyAssignments(e: Expense, assignments: { itemId: string; hadBy: string[] }[]): Expense {
  const by = new Map(assignments.map((a) => [a.itemId, a.hadBy]))
  return {
    ...e,
    items: (e.items ?? []).map((i) => (by.has(i.id) ? { ...i, eatenBy: by.get(i.id)! } : i)),
  }
}

/**
 * Tier 1 — reading.
 *
 * Payloads are compact and in major units, lists paginate, and nothing returns
 * every expense in every group. An agent should be able to understand where
 * someone stands in a couple of hundred tokens.
 */
export const readTools: ToolDef[] = [
  {
    name: 'get_context',
    description:
      'Start here. Who the signed-in user is, which group and tab are on screen, all their ' +
      'groups, and their overall balance. Everything else takes an optional groupId that defaults to the open one.',
    execute: () => {
      const s = useApp.getState()
      return {
        you: s.yourName,
        openGroup: s.openGroupId
          ? s.groups.find((g) => g.id === s.openGroupId)?.name ?? null
          : null,
        // Which tab the person is looking at, so a reply can match what they see.
        openView: s.openView,
        // Groups waiting on an answer. Joining one means seeing everyone's
        // money in it, so this is surfaced but never acted on automatically.
        // People the user has split with before. Adding one of these to a
        // group is immediate; anyone else has to be invited and accept.
        friends: s.friends.length === 0 ? null
          : s.friends.map((f) => ({ name: f.name, email: f.email })),
        invitations: s.invites.length === 0 ? null : s.invites.map((i) => ({
          invitationId: i.id,
          group: i.groupName,
          from: i.invitedByName ?? 'someone',
          as: i.memberName,
        })),
        groups: s.groups.map((g) => {
          const es = s.expenses.filter((e) => e.groupId === g.id)
          const me = g.members.find((m) => m.userId === s.you)?.id
          const net = me ? netBalances(es, s.settlements.filter((x) => x.groupId === g.id))[me] ?? 0 : 0
          return {
            id: g.id,
            name: g.name,
            currency: g.currency,
            people: g.members.map((m) => m.name),
            expenses: es.length,
            yourBalance: money(net),
            youAre: net > 0 ? 'owed' : net < 0 ? 'owing' : 'settled',
          }
        }),
      }
    },
  },
  {
    name: 'list_expenses',
    description:
      'Expenses in a group, newest first, as compact rows. Filter by who paid, a date, or text. ' +
      'Returns at most `limit` (default 20) with a hasMore flag.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'Defaults to the group on screen.' },
        paidBy: { type: 'string', description: 'A person’s name.' },
        since: { type: 'string', description: 'ISO date; only expenses on or after it.' },
        category: { type: 'string', description: 'food, drinks, stay, travel, groceries, tickets, shopping, utilities, other' },
        query: { type: 'string', description: 'Text to match in the description.' },
        limit: { type: 'number' },
      },
    },
    execute: (args) => {
      const group = resolveGroup(args.groupId)
      const s = useApp.getState()
      const limit = Math.min(Number(args.limit) || 20, 100)
      let rows = s.expenses.filter((e) => e.groupId === group.id)

      if (args.paidBy) {
        const [id] = resolvePeople([args.paidBy], group, 'paidBy')
        rows = rows.filter((e) => e.payerId === id)
      }
      if (args.since) rows = rows.filter((e) => e.occurredAt >= String(args.since))
      if (args.category) rows = rows.filter((e) => e.category === args.category)
      if (args.query) {
        const q = String(args.query).toLowerCase()
        rows = rows.filter((e) => e.description.toLowerCase().includes(q))
      }
      rows = [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

      return {
        group: group.name,
        currency: group.currency,
        total: rows.length,
        hasMore: rows.length > limit,
        expenses: rows.slice(0, limit).map((e) => summarise(e, group)),
      }
    },
  },
  {
    name: 'get_balances',
    description:
      'Who owes whom in a group right now, plus a settle-up plan using the fewest payments. ' +
      'The plan is computed by the page — do not try to work out the transfers yourself.',
    inputSchema: {
      type: 'object',
      properties: { groupId: { type: 'string' } },
    },
    execute: (args) => {
      const group = resolveGroup(args.groupId)
      const s = useApp.getState()
      const es = s.expenses.filter((e) => e.groupId === group.id)
      const ss = s.settlements.filter((x) => x.groupId === group.id)
      const balances = netBalances(es, ss)

      return {
        group: group.name,
        currency: group.currency,
        balances: group.members
          .map((m) => ({ person: nameIn(group, m.id), net: money(balances[m.id] ?? 0) }))
          .filter((b) => b.net !== 0)
          .map((b) => ({ ...b, status: b.net > 0 ? 'is owed' : 'owes' })),
        debts: debtCount(es),
        settlementPlan: minTransfers(balances).map((t) => ({
          from: nameIn(group, t.from),
          to: nameIn(group, t.to),
          amount: money(t.amountMinor),
        })),
      }
    },
  },
  {
    name: 'explain_expense',
    description:
      'Everything about one expense: how it was split, what each person owes, the line items and ' +
      'who had them, and any notes. Use this to answer "why does X owe that much?".',
    inputSchema: {
      type: 'object',
      properties: { expenseId: { type: 'string' } },
      required: ['expenseId'],
    },
    execute: (args) => {
      const e = requireExpense(args.expenseId)
      const group = resolveGroup(e.groupId)
      const shares = computeShares(e)
      return {
        id: e.id,
        description: e.description,
        date: e.occurredAt.slice(0, 10),
        category: e.category,
        paidBy: nameIn(group, e.payerId),
        currency: e.currency,
        total: money(totalOf(e)),
        ...(e.currency !== group.currency && {
          rate: e.fxRate,
          totalIn: `${money(baseTotalOf(e))} ${group.currency}`,
        }),
        splitMode: e.splitMode,
        tax: money(e.taxMinor),
        tip: money(e.tipMinor),
        // How they're spread, so you can explain a share without guessing.
        // It follows what each person ate on an itemised bill, which is the
        // point of itemising — there is nothing here to set.
        taxAndTipFollow: e.extrasPolicy === 'proportional'
          ? 'what each person ate' : 'an even split',
        owes: Object.entries(shares).map(([id, v]) => ({ person: nameIn(group, id), amount: money(v) })),
        ...(e.splitMode === 'items' && {
          itemsDecided: `${itemsDecided(e).decided}/${itemsDecided(e).total}`,
          items: (e.items ?? []).map((i) => ({
            id: i.id,
            label: i.label,
            amount: money(i.amountMinor),
            hadBy: i.eatenBy.length ? i.eatenBy.map((m) => nameIn(group, m)) : 'everyone',
          })),
        }),
        hasReceipt: Boolean(e.receiptPath),
        notes: e.rationale,
        // Without this an agent reasons against the saved bill and proposes a
        // change that looks like it does nothing.
        pendingProposals: pendingFor(e.id, e, group),
      }
    },
  },
  {
    name: 'who_owes_whom',
    description:
      'What stands between two specific people — the net, and every shared expense that makes it up. ' +
      'A group balance says someone is owed a lot; this says who should actually pay them.',
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'A name, or "me".' },
        other: { type: 'string', description: 'The other person’s name.' },
        groupId: { type: 'string' },
      },
      required: ['person', 'other'],
    },
    execute: (args) => {
      const group = resolveGroup(args.groupId)
      const [a] = resolvePeople([args.person], group, 'person')
      const [b] = resolvePeople([args.other], group, 'other')
      if (a === b) throw new Error('Those are the same person.')

      const s = useApp.getState()
      let net = 0
      const lines: { expense: string; amount: number; direction: string }[] = []

      for (const e of s.expenses.filter((x) => x.groupId === group.id)) {
        const shares = computeShares(e)
        let delta = 0
        if (e.payerId === a && (shares[b] ?? 0) > 0) delta += shares[b] ?? 0
        if (e.payerId === b && (shares[a] ?? 0) > 0) delta -= shares[a] ?? 0
        if (delta !== 0) {
          net += delta
          lines.push({
            expense: e.description,
            amount: money(Math.abs(delta)),
            direction: delta > 0 ? `${nameIn(group, b)} owes ${nameIn(group, a)}` : `${nameIn(group, a)} owes ${nameIn(group, b)}`,
          })
        }
      }
      for (const st of s.settlements.filter((x) => x.groupId === group.id)) {
        if (st.from === b && st.to === a) net -= st.amountMinor
        if (st.from === a && st.to === b) net += st.amountMinor
      }

      return {
        group: group.name,
        currency: group.currency,
        net: money(Math.abs(net)),
        summary: net === 0
          ? `${nameIn(group, a)} and ${nameIn(group, b)} are square.`
          : net > 0
            ? `${nameIn(group, b)} owes ${nameIn(group, a)} ${money(net)}`
            : `${nameIn(group, a)} owes ${nameIn(group, b)} ${money(-net)}`,
        sharedExpenses: lines,
      }
    },
  },
  {
    name: 'get_history',
    description:
      'How a bill got to be the way it is: every change, in order, with who made it — a person by ' +
      'hand, or an agent whose suggestion someone accepted — which items moved, and what it did to ' +
      'each person’s share. Use this when someone asks why they owe what they owe, who changed ' +
      'something, or whether a correction was already made. It is the record that survives the ' +
      'conversation, so it is also how you find out what happened while you weren’t looking.',
    inputSchema: {
      type: 'object',
      properties: {
        expenseId: { type: 'string', description: 'One bill. Omit for the whole group.' },
        groupId: { type: 'string' },
        limit: { type: 'number', description: 'Most recent first. Default 20.' },
      },
    },
    execute: (args) => {
      const s = useApp.getState()
      const group = resolveGroup(args.groupId)
      const expense = args.expenseId ? requireExpense(args.expenseId) : null
      const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 100)
      const nameOf = (id: string | null) =>
        group.members.find((m) => m.id === id)?.name ?? 'someone'
      const cash = (m: number) => money(m)

      const rows = s.activity
        .filter((a) => a.groupId === group.id && (!expense || a.expenseId === expense.id))
        .slice()
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
        .slice(0, limit)

      return {
        of: expense ? expense.description : group.name,
        changes: rows.map((a) => ({
          what: a.summary,
          when: a.createdAt,
          who: nameOf(a.actorMember),
          how: a.detail.via === 'agent'
            ? 'their agent suggested it and they accepted'
            : a.detail.via === 'hand' ? 'by hand' : undefined,
          reason: a.detail.reason,
          items: a.detail.items?.map((i) => ({
            item: i.label,
            cameOff: i.removed.length ? i.removed : undefined,
            wentOn: i.added.length ? i.added : undefined,
          })),
          shares: a.detail.shares?.map((r) => ({
            person: r.name,
            from: cash(r.beforeMinor),
            to: cash(r.afterMinor),
          })),
        })),
        note: rows.length === 0
          ? 'Nothing has changed here yet.'
          : 'Oldest changes are further down. Shares are that person’s cut of this one bill.',
      }
    },
  },

  {
    name: 'get_insights',
    description:
      'Where a group’s money went: total, a breakdown by category, what each person’s share came to ' +
      'versus what they actually paid out, and the biggest expenses.',
    inputSchema: { type: 'object', properties: { groupId: { type: 'string' } } },
    execute: (args) => {
      const group = resolveGroup(args.groupId)
      const es = useApp.getState().expenses.filter((e) => e.groupId === group.id)
      const byCategory: Partial<Record<Category, number>> = {}
      const spent: Record<string, number> = {}
      const paid: Record<string, number> = {}

      for (const e of es) {
        byCategory[e.category] = (byCategory[e.category] ?? 0) + baseTotalOf(e)
        paid[e.payerId] = (paid[e.payerId] ?? 0) + baseTotalOf(e)
        for (const [id, v] of Object.entries(computeShares(e))) spent[id] = (spent[id] ?? 0) + v
      }

      const total = es.reduce((s, e) => s + baseTotalOf(e), 0)
      return {
        group: group.name,
        currency: group.currency,
        total: money(total),
        expenses: es.length,
        perHead: money(Math.round(total / Math.max(1, group.members.length))),
        byCategory: Object.entries(byCategory)
          .sort((a, b) => b[1] - a[1])
          .map(([c, v]) => ({
            category: c, emoji: CATEGORY_EMOJI[c as Category],
            amount: money(v), share: `${Math.round((v / total) * 100)}%`,
          })),
        people: group.members.map((m) => ({
          person: nameIn(group, m.id),
          theirShare: money(spent[m.id] ?? 0),
          theyPaid: money(paid[m.id] ?? 0),
        })),
        biggest: [...es].sort((a, b) => baseTotalOf(b) - baseTotalOf(a)).slice(0, 3)
          .map((e) => ({ description: e.description, amount: money(baseTotalOf(e)) })),
      }
    },
  },
]

const summarise = (e: Expense, group: ReturnType<typeof resolveGroup>) => ({
  id: e.id,
  date: e.occurredAt.slice(0, 10),
  description: e.description,
  category: e.category,
  paidBy: nameIn(group, e.payerId),
  total: money(totalOf(e)),
  ...(e.currency !== group.currency && { currency: e.currency }),
  splitMode: e.splitMode,
  people: e.participants.length,
  hasReceipt: Boolean(e.receiptPath),
})
