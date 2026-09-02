import { computeShares, totalOf } from './split'
import { netBalances } from './settle'
import { formatMinor } from './money'
import type { Diff, Expense, Group, Id, Patch, Settlement } from './types'

/**
 * What a patch would do, worked out against the current state.
 *
 * The result is stored on the proposal rather than recomputed at render time,
 * so the diff someone approves is the diff they were shown — even if the
 * expense has moved on since.
 */
export function computeDiff(
  patch: Patch,
  group: Group,
  expenses: Expense[],
  settlements: Settlement[],
  nameOf: (id: Id) => string,
): Diff {
  const cur = group.currency

  if (patch.kind === 'assign_items' || patch.kind === 'update_expense') {
    const e = expenses.find((x) => x.id === (patch as { expenseId: Id }).expenseId)
    if (!e) throw new Error('That expense no longer exists.')
    const before = computeShares(e)
    const after = computeShares(applyToExpense(e, patch))
    return { scope: 'expense', currency: e.currency, before, after, headline: headlineFor(before, after, cur, nameOf) }
  }

  if (patch.kind === 'delete_expense') {
    const e = expenses.find((x) => x.id === patch.expenseId)
    if (!e) throw new Error('That expense no longer exists.')
    const before = netBalances(expenses, settlements)
    const after = netBalances(expenses.filter((x) => x.id !== e.id), settlements)
    return { scope: 'balance', currency: cur, before, after, headline: `Removes ${formatMinor(totalOf(e), e.currency)} from the ledger` }
  }

  if (patch.kind === 'settle') {
    const before = netBalances(expenses, settlements)
    const after = netBalances(expenses, [
      ...settlements,
      { id: 'preview', groupId: group.id, from: patch.from, to: patch.to, amountMinor: patch.amountMinor, settledAt: '' },
    ])
    return {
      scope: 'balance', currency: cur, before, after,
      headline: `${nameOf(patch.from)} pays ${nameOf(patch.to)} ${formatMinor(patch.amountMinor, cur)}`,
    }
  }

  // add_expense: show what each person would owe on the new bill.
  const draft = draftFromInput(patch.input, group)
  const shares = computeShares(draft)
  const before: Record<Id, number> = {}
  for (const id of Object.keys(shares)) before[id] = 0
  return {
    scope: 'expense', currency: draft.currency, before, after: shares,
    headline: `Adds ${formatMinor(totalOf(draft), draft.currency)} — ${patch.input.description}`,
  }
}

/** A throwaway Expense so a proposed addition can be costed before it exists. */
export function draftFromInput(input: Patch extends { kind: 'add_expense' } ? never : never, group: Group): Expense
export function draftFromInput(input: Extract<Patch, { kind: 'add_expense' }>['input'], group: Group): Expense
export function draftFromInput(input: Extract<Patch, { kind: 'add_expense' }>['input'], group: Group): Expense {
  return {
    id: 'preview', groupId: group.id, payerId: input.payerId,
    description: input.description, category: input.category,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    currency: input.currency ?? group.currency,
    participants: input.participants, splitMode: input.splitMode,
    totalMinor: input.totalMinor, weights: input.weights, items: input.items,
    taxMinor: input.taxMinor ?? 0, tipMinor: input.tipMinor ?? 0,
    extrasPolicy: 'proportional',
    fxRate: input.fxRate ?? 1,
    baseTotalMinor: Math.round(input.totalMinor * (input.fxRate ?? 1)),
    rationale: [], createdBy: 'agent', createdAt: new Date().toISOString(),
  }
}

/** Applies a patch to an expense in memory, for previewing. */
function applyToExpense(e: Expense, patch: Patch): Expense {
  if (patch.kind === 'assign_items') {
    const by = new Map(patch.assignments.map((a) => [a.itemId, a.hadBy]))
    return {
      ...e,
      items: (e.items ?? []).map((i) => (by.has(i.id) ? { ...i, eatenBy: by.get(i.id)! } : i)),
    }
  }
  if (patch.kind === 'update_expense') return { ...e, ...patch.fields }
  return e
}

/** "Ravi pays ₹2,023 less" — the one line that says what changed. */
function headlineFor(
  before: Record<Id, number>, after: Record<Id, number>,
  currency: string, nameOf: (id: Id) => string,
): string {
  const moves = Object.keys({ ...before, ...after })
    .map((id) => ({ id, d: (after[id] ?? 0) - (before[id] ?? 0) }))
    .filter((m) => m.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))

  if (moves.length === 0) return 'Nothing would change'
  const biggest = moves[0]
  const rest = moves.length - 1
  return `${nameOf(biggest.id)} pays ${formatMinor(Math.abs(biggest.d), currency)} ${biggest.d < 0 ? 'less' : 'more'}`
    + (rest > 0 ? `, and ${rest} other${rest > 1 ? 's' : ''} change` : '')
}

/** Who ends up worse off. They're the ones who deserve a say. */
export function affectedBy(diff: Diff): Id[] {
  return Object.keys({ ...diff.before, ...diff.after })
    .filter((id) => (diff.after[id] ?? 0) > (diff.before[id] ?? 0))
}

/**
 * Whether a revision can be folded into a pending draft.
 *
 * Assignments and field edits accumulate: "take Meera off the non-veg" and
 * "but she had the mutton" are two halves of one intent, and treating the
 * second as a replacement silently discards the first. Settling, deleting and
 * adding are single indivisible acts — a second one replaces the first.
 */
export const isAmendable = (kind: Patch['kind']) =>
  kind === 'assign_items' || kind === 'update_expense'

/**
 * Folds a revision into a draft. Later instructions win on the lines they
 * mention; everything already decided is left alone.
 */
export function mergePatches(draft: Patch, revision: Patch): Patch {
  if (draft.kind === 'assign_items' && revision.kind === 'assign_items') {
    const merged = new Map(draft.assignments.map((a) => [a.itemId, a.hadBy]))
    for (const a of revision.assignments) merged.set(a.itemId, a.hadBy)
    return {
      kind: 'assign_items',
      expenseId: draft.expenseId,
      assignments: [...merged].map(([itemId, hadBy]) => ({ itemId, hadBy })),
    }
  }
  if (draft.kind === 'update_expense' && revision.kind === 'update_expense') {
    return {
      kind: 'update_expense',
      expenseId: draft.expenseId,
      fields: { ...draft.fields, ...revision.fields },
    }
  }
  return revision
}

/**
 * What a draft would do *right now*.
 *
 * The stored diff records what was costed when the suggestion was made; the
 * bill can move under it — someone else's proposal is accepted, a person edits
 * by hand. Recomputing at render is both cheaper than writing every pending
 * row on every change and more honest: it can never show a stale number, and
 * the two together let the card say when they've drifted apart.
 */
export function liveDiff(
  patch: Patch, group: Group, expenses: Expense[], settlements: Settlement[],
  nameOf: (id: Id) => string,
): Diff | null {
  try {
    return computeDiff(patch, group, expenses, settlements, nameOf)
  } catch {
    // What it referred to is gone.
    return null
  }
}

/** Whether two diffs land on the same numbers. */
export function sameEffect(a: Diff, b: Diff): boolean {
  const ids = new Set([
    ...Object.keys(a.before), ...Object.keys(a.after),
    ...Object.keys(b.before), ...Object.keys(b.after),
  ])
  for (const id of ids) {
    if ((a.after[id] ?? 0) - (a.before[id] ?? 0) !== (b.after[id] ?? 0) - (b.before[id] ?? 0)) {
      return false
    }
  }
  return true
}

/** Whether a diff actually moves any money. */
export const isEmptyDiff = (diff: Diff) =>
  Object.keys({ ...diff.before, ...diff.after })
    .every((id) => (diff.after[id] ?? 0) === (diff.before[id] ?? 0))

/**
 * Whether one proposal is about the same thing as another — either to amend
 * it, or to replace it when the change is indivisible.
 */
export function sameTarget(a: Patch, b: Patch): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'assign_items':
    case 'update_expense':
    case 'delete_expense':
      return a.expenseId === (b as typeof a).expenseId
    case 'settle': {
      const other = b as typeof a
      return a.from === other.from && a.to === other.to
    }
    case 'add_expense': {
      // A revised draft of the same expense, not a second one.
      const other = b as typeof a
      return a.input.description.trim().toLowerCase()
        === other.input.description.trim().toLowerCase()
    }
  }
}

export const summarisePatch = (patch: Patch): string => ({
  assign_items: 'Change who had what',
  update_expense: 'Edit the expense',
  add_expense: 'Add an expense',
  delete_expense: 'Delete the expense',
  settle: 'Record a payment',
}[patch.kind])
