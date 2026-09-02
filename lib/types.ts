export type Id = string

export interface Person {
  id: Id
  name: string
  hue: number
  /** Set when this member has claimed their seat with an account. */
  userId?: string | null
}

export interface Group {
  id: Id
  name: string
  emoji: string
  currency: string
  /** Capability for the join link. Anyone holding it can claim a seat. */
  inviteToken: string | null
  members: Person[]
  createdAt: string
}

/** How the total is divided among the people on an expense. */
export type SplitMode = 'equal' | 'shares' | 'exact' | 'items'

export interface LineItem {
  id: Id
  label: string
  amountMinor: number
  /** Who had this. Empty means everyone on the expense. */
  eatenBy: Id[]
}

export type ExtrasPolicy = 'proportional' | 'equal'

export interface Expense {
  id: Id
  groupId: Id
  /** Who actually paid the bill. */
  payerId: Id
  description: string
  category: Category
  occurredAt: string
  currency: string

  /** Everyone this expense is divided among. */
  participants: Id[]
  splitMode: SplitMode

  /** Authoritative total for equal / shares / exact. Derived for items. */
  totalMinor: number

  /** shares mode: relative weights, default 1. */
  weights?: Record<Id, number>
  /** exact mode: minor units per person; must sum to totalMinor. */
  exact?: Record<Id, number>
  /** items mode. */
  items?: LineItem[]
  taxMinor: number
  tipMinor: number
  extrasPolicy: ExtrasPolicy

  /** Units of the group currency per unit of `currency`, fixed at entry time. */
  fxRate: number
  /** `totalMinor` in the group's currency. Balances use this, never totalMinor. */
  baseTotalMinor: number
  receiptPath?: string | null
  note?: string | null
  /** Provenance, appended by both UI edits and tool calls. */
  rationale: string[]
  needsReview?: string | null
  createdBy: 'human' | 'agent'
  createdAt: string
}

export const CATEGORIES = [
  'food', 'drinks', 'stay', 'travel', 'groceries',
  'tickets', 'shopping', 'utilities', 'other',
] as const
export type Category = (typeof CATEGORIES)[number]

/**
 * Emoji-presentation by default — no U+FE0F variation selectors.
 * The three that needed one (plate, ticket, shopping bags) rendered as tofu
 * wherever the font stack didn't reach a colour emoji face.
 */
export const CATEGORY_EMOJI: Record<Category, string> = {
  food: '🍛', drinks: '🍸', stay: '🏠', travel: '🚕', groceries: '🛒',
  tickets: '🎫', shopping: '👕', utilities: '💡', other: '📌',
}

export interface Settlement {
  id: Id
  groupId: Id
  from: Id
  to: Id
  amountMinor: number
  settledAt: string
  note?: string | null
}

export type ActivityKind =
  | 'group_created' | 'member_added' | 'member_removed'
  | 'expense_added' | 'expense_edited' | 'expense_deleted'
  | 'settlement_added' | 'settlement_undone'
  | 'proposal_made' | 'proposal_accepted' | 'proposal_rejected'

/**
 * What an entry actually did.
 *
 * The summary line is for skimming; this is for answering "what changed, and
 * what did it cost me". It is also the thing an agent reads back when someone
 * asks why a number is what it is.
 */
export interface ActivityDetail {
  /** Who did it: a person clicking, or an agent's proposal someone accepted. */
  via?: 'hand' | 'agent'
  /** Per line item, who came on and who came off. */
  items?: { label: string; added: string[]; removed: string[] }[]
  /** What it did to each person's share of this expense, in minor units. */
  shares?: { name: string; beforeMinor: number; afterMinor: number }[]
  /** The reason an agent gave, when there was one. */
  reason?: string
}

export interface Activity {
  id: Id
  groupId: Id
  /** The expense this was about, if any. Null once that expense is deleted. */
  expenseId: Id | null
  actorMember: Id | null
  kind: ActivityKind
  summary: string
  amountMinor: number | null
  detail: ActivityDetail
  createdAt: string
}

export type Cadence = 'weekly' | 'monthly'

export interface Recurring {
  id: Id
  groupId: Id
  description: string
  category: Category
  payerId: Id
  totalMinor: number
  currency: string
  participants: Id[]
  splitMode: SplitMode
  weights: Record<Id, number>
  cadence: Cadence
  /** ISO date (no time) of the next instance that should exist. */
  nextDue: string
  active: boolean
}

// ── conversation ─────────────────────────────────────────────────────────

export type MessageKind = 'comment' | 'proposal' | 'event'
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded' | 'withdrawn'

/**
 * A change an agent wants to make, expressed so the page can both *show* what
 * it would do and apply it later, unchanged, when someone approves.
 */
export type Patch =
  | { kind: 'assign_items'; expenseId: Id; assignments: { itemId: Id; hadBy: Id[] }[] }
  | { kind: 'update_expense'; expenseId: Id; fields: Partial<Expense> }
  | { kind: 'add_expense'; input: NewExpenseInput }
  | { kind: 'delete_expense'; expenseId: Id }
  | { kind: 'settle'; from: Id; to: Id; amountMinor: number }

/** What the patch does to the money, worked out when the proposal was made. */
export interface Diff {
  /** Per member: their share of this expense, or their group balance. */
  scope: 'expense' | 'balance'
  currency: string
  before: Record<Id, number>
  after: Record<Id, number>
  /** A one-line human summary, e.g. "Ravi pays ₹2,023 less". */
  headline: string
}

export interface NewExpenseInput {
  description: string
  payerId: Id
  totalMinor: number
  participants: Id[]
  splitMode: SplitMode
  category: Category
  occurredAt?: string
  currency?: string
  fxRate?: number
  weights?: Record<Id, number>
  items?: LineItem[]
  taxMinor?: number
  tipMinor?: number
  /** Already in storage. An agent reading a bill uploads the photo when it
   *  reads it, so the proposal can show what it is proposing from. */
  receiptPath?: string | null
}

export interface Revision { body: string; at: string }

export interface Message {
  id: Id
  groupId: Id
  expenseId: Id | null
  authorMember: Id | null
  authorKind: 'human' | 'agent'
  kind: MessageKind
  body: string
  patch: Patch | null
  diff: Diff | null
  status: ProposalStatus | null
  resolvedBy: Id | null
  resolvedAt: string | null
  resolutionNote: string | null
  /** Each thing the agent said while building this draft, oldest first. */
  revisions: Revision[]
  createdAt: string
}

export interface Transfer {
  from: Id
  to: Id
  amountMinor: number
}
