import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import type {
  Activity, ActivityDetail, ActivityKind, Cadence, Category, Diff, Expense, Group, Id, LineItem,
  Message, Patch, Person, Recurring, Settlement, SplitMode, Transfer,
} from '@/lib/types'
import type { Json } from '@/lib/supabase/types'
import { hueFor } from '@/lib/palette'

/**
 * The only place SQL rows become domain objects.
 *
 * Money crosses this boundary as bigint minor units and stays an integer the
 * whole way; nothing here ever sees a float.
 */

type Row = Record<string, unknown>

const toPerson = (r: Row): Person => ({
  id: r.id as string,
  name: r.display_name as string,
  hue: Number(r.hue),
  userId: (r.user_id as string | null) ?? null,
})

const toGroup = (r: Row, members: Person[]): Group => ({
  id: r.id as string,
  name: r.name as string,
  emoji: r.emoji as string,
  currency: r.currency as string,
  inviteToken: (r.invite_token as string) ?? null,
  members,
  createdAt: r.created_at as string,
})

const toActivity = (r: Row): Activity => ({
  id: r.id as string,
  groupId: r.group_id as string,
  expenseId: (r.expense_id as string | null) ?? null,
  actorMember: (r.actor_member as string | null) ?? null,
  kind: r.kind as ActivityKind,
  summary: r.summary as string,
  amountMinor: r.amount_minor === null || r.amount_minor === undefined ? null : Number(r.amount_minor),
  detail: (r.detail ?? {}) as ActivityDetail,
  createdAt: r.created_at as string,
})

const toRecurring = (r: Row): Recurring => ({
  id: r.id as string,
  groupId: r.group_id as string,
  description: r.description as string,
  category: r.category as Category,
  payerId: r.payer_id as string,
  totalMinor: Number(r.total_minor),
  currency: r.currency as string,
  participants: (r.participants as string[]) ?? [],
  splitMode: r.split_mode as SplitMode,
  weights: (r.weights as Record<string, number>) ?? {},
  cadence: r.cadence as Cadence,
  nextDue: r.next_due as string,
  active: Boolean(r.active),
})

const toItem = (r: Row): LineItem => ({
  id: r.id as string,
  label: r.label as string,
  amountMinor: Number(r.amount_minor),
  eatenBy: (r.eaten_by as string[]) ?? [],
})

const toExpense = (r: Row, items: LineItem[]): Expense => ({
  id: r.id as string,
  groupId: r.group_id as string,
  payerId: r.payer_id as string,
  description: r.description as string,
  category: r.category as Category,
  occurredAt: r.occurred_at as string,
  currency: r.currency as string,
  participants: (r.participants as string[]) ?? [],
  splitMode: r.split_mode as SplitMode,
  totalMinor: Number(r.total_minor),
  weights: (r.weights as Record<string, number>) ?? {},
  exact: (r.exact as Record<string, number>) ?? {},
  items,
  taxMinor: Number(r.tax_minor),
  tipMinor: Number(r.tip_minor),
  extrasPolicy: r.extras_policy as 'proportional' | 'equal',
  fxRate: Number(r.fx_rate ?? 1),
  baseTotalMinor: Number(r.base_total_minor ?? 0),
  receiptPath: (r.receipt_path as string | null) ?? null,
  note: (r.note as string | null) ?? null,
  rationale: (r.rationale as string[]) ?? [],
  needsReview: (r.needs_review as string | null) ?? null,
  createdBy: (r.created_by_kind as 'human' | 'agent') ?? 'human',
  createdAt: r.created_at as string,
})

const toSettlement = (r: Row): Settlement => ({
  id: r.id as string,
  groupId: r.group_id as string,
  from: r.from_member as string,
  to: r.to_member as string,
  amountMinor: Number(r.amount_minor),
  settledAt: r.settled_at as string,
  note: (r.note as string | null) ?? null,
})

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`)
}

// ── reads ────────────────────────────────────────────────────────────────

export async function loadProfileName(fallback: string): Promise<string> {
  const db = supabase()
  const { data: auth } = await db.auth.getUser()
  if (!auth.user) return fallback
  const { data } = await db.from('profiles').select('display_name').eq('id', auth.user.id).maybeSingle()
  return data?.display_name?.trim() || fallback
}

export async function loadEverything(): Promise<{
  groups: Group[]; expenses: Expense[]; settlements: Settlement[]
  activity: Activity[]; recurring: Recurring[]
}> {
  const db = supabase()

  const [{ data: groupRows, error: gErr }, { data: memberRows, error: mErr }] = await Promise.all([
    db.from('groups').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    db.from('group_members').select('*').order('created_at'),
  ])
  fail('Couldn’t load your groups', gErr)
  fail('Couldn’t load group members', mErr)

  const membersByGroup = new Map<string, Person[]>()
  for (const r of memberRows ?? []) {
    const list = membersByGroup.get(r.group_id as string) ?? []
    list.push(toPerson(r as Row))
    membersByGroup.set(r.group_id as string, list)
  }
  const groups = (groupRows ?? []).map((r) => toGroup(r as Row, membersByGroup.get(r.id as string) ?? []))

  if (groups.length === 0) {
    return { groups, expenses: [], settlements: [], activity: [], recurring: [] }
  }

  const ids = groups.map((g) => g.id)
  const [
    { data: expenseRows, error: eErr },
    { data: settleRows, error: sErr },
    { data: activityRows },
    { data: recurringRows },
  ] = await Promise.all([
    db.from('expenses').select('*').in('group_id', ids).is('deleted_at', null)
      .order('occurred_at', { ascending: false }),
    db.from('settlements').select('*').in('group_id', ids),
    db.from('activity').select('*').in('group_id', ids).order('created_at', { ascending: false }).limit(200),
    db.from('recurring').select('*').in('group_id', ids).eq('active', true),
  ])
  fail('Couldn’t load expenses', eErr)
  fail('Couldn’t load settlements', sErr)

  const expenseIds = (expenseRows ?? []).map((r) => r.id as string)
  let itemsByExpense = new Map<string, LineItem[]>()
  if (expenseIds.length > 0) {
    const { data: itemRows, error: iErr } = await db
      .from('expense_items').select('*').in('expense_id', expenseIds).order('position')
    fail('Couldn’t load the bill lines', iErr)
    itemsByExpense = (itemRows ?? []).reduce((map, r) => {
      const list = map.get(r.expense_id as string) ?? []
      list.push(toItem(r as Row))
      map.set(r.expense_id as string, list)
      return map
    }, new Map<string, LineItem[]>())
  }

  return {
    groups,
    expenses: (expenseRows ?? []).map((r) => toExpense(r as Row, itemsByExpense.get(r.id as string) ?? [])),
    settlements: (settleRows ?? []).map((r) => toSettlement(r as Row)),
    activity: (activityRows ?? []).map((r) => toActivity(r as Row)),
    recurring: (recurringRows ?? []).map((r) => toRecurring(r as Row)),
  }
}

// ── activity ─────────────────────────────────────────────────────────────

export async function logActivity(
  groupId: Id, kind: ActivityKind, summary: string,
  opts: {
    actorMember?: Id | null; amountMinor?: number | null; expenseId?: Id | null
    detail?: ActivityDetail
  } = {},
): Promise<Activity | null> {
  const db = supabase()
  const { data: auth } = await db.auth.getUser()
  const { data, error } = await db.from('activity').insert({
    group_id: groupId,
    actor_member: opts.actorMember ?? null,
    actor_user: auth.user?.id ?? null,
    kind,
    summary,
    amount_minor: opts.amountMinor ?? null,
    expense_id: opts.expenseId ?? null,
    detail: (opts.detail ?? {}) as never,
  }).select().single()
  // The log is a nicety; never let it fail a real action.
  if (error) return null
  return toActivity(data as Row)
}

// ── recurring ────────────────────────────────────────────────────────────

export async function createRecurring(input: Omit<Recurring, 'id' | 'active'>): Promise<Recurring> {
  const { data, error } = await supabase().from('recurring').insert({
    group_id: input.groupId, description: input.description, category: input.category,
    payer_id: input.payerId, total_minor: input.totalMinor, currency: input.currency,
    participants: input.participants, split_mode: input.splitMode, weights: input.weights,
    cadence: input.cadence, next_due: input.nextDue,
  }).select().single()
  fail('Couldn’t save the repeating expense', error)
  return toRecurring(data as Row)
}

export async function advanceRecurring(id: Id, nextDue: string): Promise<void> {
  const { error } = await supabase().from('recurring').update({ next_due: nextDue }).eq('id', id)
  fail('Couldn’t reschedule', error)
}

export async function stopRecurring(id: Id): Promise<void> {
  const { error } = await supabase().from('recurring').update({ active: false }).eq('id', id)
  fail('Couldn’t stop that repeating expense', error)
}

// ── invites ──────────────────────────────────────────────────────────────

export interface InvitePeek {
  ok: boolean
  reason?: string
  alreadyMember?: boolean
  groupId?: string
  name?: string
  emoji?: string
  seats?: { id: string; name: string }[]
}

export async function peekInvite(token: string): Promise<InvitePeek> {
  const { data, error } = await supabase().rpc('peek_invite', { p_token: token })
  if (error) throw new Error(error.message)
  return data as unknown as InvitePeek
}

export async function joinGroup(token: string, memberId?: string | null): Promise<string> {
  const { data, error } = await supabase().rpc('join_group', {
    p_token: token, p_member_id: memberId ?? undefined,
  })
  if (error) throw new Error(error.message)
  return data as string
}

// ── groups ───────────────────────────────────────────────────────────────

export async function createGroup(
  name: string, emoji: string, yourName: string, others: string[],
): Promise<Group> {
  const db = supabase()
  const { data: auth } = await db.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('You need to be signed in to make a group.')

  const { data: group, error } = await db
    .from('groups').insert({ name, emoji, created_by: userId }).select().single()
  fail('Couldn’t create the group', error)

  const seats = [
    { group_id: group!.id, display_name: yourName, hue: hueFor(0), user_id: userId },
    ...others.map((n, i) => ({ group_id: group!.id, display_name: n, hue: hueFor(i + 1), user_id: null })),
  ]
  const { data: members, error: mErr } = await db.from('group_members').insert(seats).select()
  fail('Couldn’t add the people', mErr)

  return toGroup(group as Row, (members ?? []).map((r) => toPerson(r as Row)))
}

export async function addMember(groupId: Id, name: string, hue: number): Promise<Person> {
  const { data, error } = await supabase()
    .from('group_members').insert({ group_id: groupId, display_name: name, hue }).select().single()
  fail('Couldn’t add that person', error)
  return toPerson(data as Row)
}

export async function removeMember(memberId: Id): Promise<void> {
  const { error } = await supabase().from('group_members').delete().eq('id', memberId)
  fail('Couldn’t remove that person', error)
}

export async function renameGroup(groupId: Id, name: string, emoji: string): Promise<void> {
  const { error } = await supabase().from('groups').update({ name, emoji }).eq('id', groupId)
  fail('Couldn’t rename the group', error)
}

// ── expenses ─────────────────────────────────────────────────────────────

export interface NewExpenseInput {
  groupId: Id
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
  exact?: Record<Id, number>
  items?: LineItem[]
  taxMinor?: number
  tipMinor?: number
  receiptPath?: string | null
  note?: string | null
  rationale?: string[]
  createdByKind?: 'human' | 'agent'
}

export async function createExpense(input: NewExpenseInput): Promise<Expense> {
  const db = supabase()
  const { data: auth } = await db.auth.getUser()

  const { data: row, error } = await db.from('expenses').insert({
    group_id: input.groupId,
    payer_id: input.payerId,
    description: input.description,
    category: input.category,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    split_mode: input.splitMode,
    total_minor: input.totalMinor,
    currency: input.currency ?? 'INR',
    fx_rate: input.fxRate ?? 1,
    base_total_minor: Math.round(input.totalMinor * (input.fxRate ?? 1)),
    tax_minor: input.taxMinor ?? 0,
    tip_minor: input.tipMinor ?? 0,
    participants: input.participants,
    weights: input.weights ?? {},
    exact: input.exact ?? {},
    receipt_path: input.receiptPath ?? null,
    note: input.note ?? null,
    rationale: input.rationale ?? [],
    created_by_kind: input.createdByKind ?? 'human',
    created_by: auth.user?.id ?? null,
  }).select().single()
  fail('Couldn’t save the expense', error)

  let items: LineItem[] = []
  if (input.items?.length) {
    const { data: itemRows, error: iErr } = await db.from('expense_items').insert(
      input.items.map((i, position) => ({
        expense_id: row!.id, label: i.label, amount_minor: i.amountMinor,
        eaten_by: i.eatenBy, position,
      })),
    ).select().order('position')
    fail('Couldn’t save the bill lines', iErr)
    items = (itemRows ?? []).map((r) => toItem(r as Row))
  }

  return toExpense(row as Row, items)
}

type ExpenseUpdate = Database['public']['Tables']['expenses']['Update']

export async function updateExpense(id: Id, patch: Partial<Expense>): Promise<void> {
  const row: ExpenseUpdate = {}
  if (patch.description !== undefined) row.description = patch.description
  if (patch.category !== undefined) row.category = patch.category
  if (patch.payerId !== undefined) row.payer_id = patch.payerId
  if (patch.participants !== undefined) row.participants = patch.participants
  if (patch.splitMode !== undefined) row.split_mode = patch.splitMode
  if (patch.totalMinor !== undefined) row.total_minor = patch.totalMinor
  if (patch.currency !== undefined) row.currency = patch.currency
  if (patch.fxRate !== undefined) row.fx_rate = patch.fxRate
  if (patch.baseTotalMinor !== undefined) row.base_total_minor = patch.baseTotalMinor
  if (patch.taxMinor !== undefined) row.tax_minor = patch.taxMinor
  if (patch.tipMinor !== undefined) row.tip_minor = patch.tipMinor
  if (patch.extrasPolicy !== undefined) row.extras_policy = patch.extrasPolicy
  if (patch.weights !== undefined) row.weights = patch.weights as Database['public']['Tables']['expenses']['Row']['weights']
  if (patch.exact !== undefined) row.exact = patch.exact as Database['public']['Tables']['expenses']['Row']['exact']
  if (patch.rationale !== undefined) row.rationale = patch.rationale
  if (patch.needsReview !== undefined) row.needs_review = patch.needsReview
  if (patch.note !== undefined) row.note = patch.note
  if (Object.keys(row).length === 0) return
  const { error } = await supabase().from('expenses').update(row).eq('id', id)
  fail('Couldn’t update the expense', error)
}

export async function setItemEaters(itemId: Id, people: Id[]): Promise<void> {
  const { error } = await supabase().from('expense_items').update({ eaten_by: people }).eq('id', itemId)
  fail('Couldn’t change who had that', error)
}

/**
 * Marked, not removed — so undo restores the same row, and it keeps its items,
 * its thread and its place in the history rather than coming back a stranger.
 */
export async function deleteExpense(id: Id): Promise<void> {
  const { error } = await supabase()
    .from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  fail('Couldn’t delete the expense', error)
}

export async function restoreExpense(id: Id): Promise<void> {
  const { error } = await supabase().from('expenses').update({ deleted_at: null }).eq('id', id)
  fail('Couldn’t bring that expense back', error)
}

// ── settlements ──────────────────────────────────────────────────────────

export async function recordSettlement(groupId: Id, t: Transfer, note?: string): Promise<Settlement> {
  const { data, error } = await supabase().from('settlements').insert({
    group_id: groupId, from_member: t.from, to_member: t.to,
    amount_minor: t.amountMinor, note: note ?? null,
  }).select().single()
  fail('Couldn’t record the payment', error)
  return toSettlement(data as Row)
}

// ── receipts ─────────────────────────────────────────────────────────────

/** Stored as <group_id>/<uuid>.jpg — the first segment carries authorisation. */
export async function uploadReceipt(groupId: Id, dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob()
  const path = `${groupId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase().storage.from('receipts')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  fail('Couldn’t upload the receipt', error)
  return path
}

/**
 * The bucket is private, so a stored path is not something a browser can load.
 * Every render has to exchange the path for a short-lived signed URL.
 */
export async function signReceipt(path: string, seconds = 60 * 60): Promise<string> {
  const { data, error } = await supabase().storage.from('receipts').createSignedUrl(path, seconds)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Couldn’t open that receipt.')
  }
  return data.signedUrl
}

export async function deleteSettlement(id: Id): Promise<void> {
  const { error } = await supabase().from('settlements').delete().eq('id', id)
  fail('Couldn’t undo that payment', error)
}

export async function setReceiptPath(expenseId: Id, path: string | null): Promise<void> {
  const { error } = await supabase().from('expenses').update({ receipt_path: path }).eq('id', expenseId)
  fail('Couldn’t attach the receipt', error)
}

/** Items have no stable identity across an edit, so replace the set wholesale. */
export async function replaceItems(expenseId: Id, items: LineItem[]): Promise<LineItem[]> {
  const db = supabase()
  const { error: delErr } = await db.from('expense_items').delete().eq('expense_id', expenseId)
  fail('Couldn’t update the bill lines', delErr)
  if (items.length === 0) return []
  const { data, error } = await db.from('expense_items').insert(
    items.map((i, position) => ({
      expense_id: expenseId, label: i.label, amount_minor: i.amountMinor,
      eaten_by: i.eatenBy, position,
    })),
  ).select().order('position')
  fail('Couldn’t update the bill lines', error)
  return (data ?? []).map((r) => toItem(r as Row))
}

export async function deleteGroup(id: Id): Promise<void> {
  const { error } = await supabase()
    .from('groups').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  fail('Couldn’t delete the group', error)
}

export async function restoreGroup(id: Id): Promise<void> {
  const { error } = await supabase().from('groups').update({ deleted_at: null }).eq('id', id)
  fail('Couldn’t bring that group back', error)
}

export async function renameMember(memberId: Id, name: string): Promise<void> {
  const { error } = await supabase().from('group_members').update({ display_name: name }).eq('id', memberId)
  fail('Couldn’t rename', error)
}

export async function setDisplayName(name: string): Promise<void> {
  const db = supabase()
  const { data: auth } = await db.auth.getUser()
  if (!auth.user) return
  const { error } = await db.from('profiles').update({ display_name: name }).eq('id', auth.user.id)
  fail('Couldn’t save your name', error)
}

// ── conversation ─────────────────────────────────────────────────────────

const toMessage = (r: Row): Message => ({
  id: r.id as string,
  groupId: r.group_id as string,
  expenseId: (r.expense_id as string | null) ?? null,
  authorMember: (r.author_member as string | null) ?? null,
  authorKind: (r.author_kind as 'human' | 'agent') ?? 'human',
  kind: r.kind as Message['kind'],
  body: (r.body as string) ?? '',
  patch: (r.patch as Patch | null) ?? null,
  diff: (r.diff as Diff | null) ?? null,
  status: (r.status as Message['status']) ?? null,
  resolvedBy: (r.resolved_by as string | null) ?? null,
  resolvedAt: (r.resolved_at as string | null) ?? null,
  resolutionNote: (r.resolution_note as string | null) ?? null,
  revisions: (r.revisions as Message['revisions']) ?? [],
  createdAt: r.created_at as string,
})

export async function loadMessages(groupIds: Id[]): Promise<Message[]> {
  if (groupIds.length === 0) return []
  const { data, error } = await supabase()
    .from('messages').select('*').in('group_id', groupIds)
    .order('created_at', { ascending: true }).limit(500)
  fail('Couldn’t load the conversation', error)
  return (data ?? []).map((r) => toMessage(r as Row))
}

export async function postMessage(input: {
  groupId: Id
  expenseId?: Id | null
  authorMember: Id | null
  authorKind?: 'human' | 'agent'
  kind?: Message['kind']
  body: string
  patch?: Patch | null
  diff?: Diff | null
}): Promise<Message> {
  const db = supabase()
  const { data: auth } = await db.auth.getUser()
  const isProposal = input.kind === 'proposal'
  const { data, error } = await db.from('messages').insert({
    group_id: input.groupId,
    expense_id: input.expenseId ?? null,
    author_member: input.authorMember,
    author_user: auth.user?.id ?? null,
    author_kind: input.authorKind ?? 'human',
    kind: input.kind ?? 'comment',
    body: input.body,
    patch: isProposal ? (input.patch as unknown as Json) : null,
    diff: isProposal ? (input.diff as unknown as Json) : null,
    status: isProposal ? 'pending' : null,
    revisions: isProposal
      ? ([{ body: input.body, at: new Date().toISOString() }] as unknown as Json)
      : ([] as unknown as Json),
  }).select().single()
  fail('Couldn’t post that', error)
  return toMessage(data as Row)
}

export async function resolveProposal(
  id: Id, status: 'accepted' | 'rejected' | 'superseded' | 'withdrawn',
  resolvedBy: Id | null, note?: string,
): Promise<void> {
  const { error } = await supabase().from('messages').update({
    status, resolved_by: resolvedBy, resolved_at: new Date().toISOString(),
    resolution_note: note ?? null,
  }).eq('id', id).eq('status', 'pending')
  fail('Couldn’t update that proposal', error)
}

/**
 * Everyone in a group watches the same ledger.
 *
 * Messages arrive as rows and merge straight in, because a thread is append-
 * mostly and the payload is the whole truth. Ledger changes only signal that
 * something moved: shares depend on rows across four tables, so the client
 * refetches rather than trying to patch a derived value from a single row.
 */
export function watchGroups(
  groupIds: Id[],
  handlers: {
    onMessage: (m: Message) => void
    onMessageGone: (id: Id) => void
    onActivity: (a: Activity) => void
    onLedgerChange: () => void
  },
) {
  if (groupIds.length === 0) return () => {}
  const db = supabase()
  const channel = db
    .channel('tabby')
    // DELETE carries only the primary key, so it can't be mapped to a message —
    // it has to be reported as a removal, or the stub resurrects the thread.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => {
        const id = (payload.old as Row | undefined)?.id
        if (typeof id === 'string') handlers.onMessageGone(id)
      })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const row = payload.new as Row | undefined
        if (row?.id) handlers.onMessage(toMessage(row))
      })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' },
      (payload) => {
        const row = payload.new as Row | undefined
        if (row?.id) handlers.onMessage(toMessage(row))
      })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' },
      (payload) => {
        const row = payload.new as Row | undefined
        if (row?.id) handlers.onActivity(toActivity(row))
      })
  for (const table of ['expenses', 'expense_items', 'settlements', 'group_members']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, handlers.onLedgerChange)
  }
  channel.subscribe()
  return () => { void db.removeChannel(channel) }
}

/** Folds a revision into a pending draft, keeping what the agent said. */
export async function amendProposal(
  id: Id, patch: Patch, diff: Diff, body: string, revisions: Message['revisions'],
): Promise<void> {
  const { error } = await supabase().from('messages').update({
    patch: patch as unknown as Json,
    diff: diff as unknown as Json,
    body,
    revisions: revisions as unknown as Json,
  }).eq('id', id).eq('status', 'pending')
  fail('Couldn’t update the suggestion', error)
}

/** Retires proposals a newer one replaces. Ignores any already decided. */
export async function supersedeProposals(ids: Id[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase().from('messages').update({
    status: 'superseded', resolved_at: new Date().toISOString(),
  }).in('id', ids).eq('status', 'pending')
  fail('Couldn’t tidy up the older suggestion', error)
}

// ── invitations ──────────────────────────────────────────────────────────

export interface Invite {
  id: Id
  groupId: Id
  groupName: string
  invitedByName: string | null
  memberName: string | null
  createdAt: string
}

export interface SentInvite {
  id: Id
  email: string
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  memberName: string | null
  createdAt: string
}

/** Offer a seat to an email address. `memberId` names an unclaimed seat. */
export async function inviteByEmail(
  groupId: Id, email: string, invitedBy: Id | null, memberId: Id | null,
): Promise<Id> {
  const { data, error } = await supabase().from('invites')
    .insert({ group_id: groupId, email: email.trim().toLowerCase(),
              invited_by: invitedBy, member_id: memberId })
    .select('id').single()
  if (error?.code === '23505') {
    throw new Error(`${email} already has an invitation waiting for this group.`)
  }
  fail('Couldn’t send that invitation', error)
  return (data as Row).id as Id
}

/** What this group has sent, so nobody invites the same person twice. */
export async function invitesForGroup(groupId: Id): Promise<SentInvite[]> {
  const { data, error } = await supabase().from('invites')
    .select('id, email, status, created_at, group_members!invites_member_id_fkey(display_name)')
    .eq('group_id', groupId).order('created_at', { ascending: false })
  fail('Couldn’t read the invitations', error)
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as Id,
    email: r.email as string,
    status: r.status as SentInvite['status'],
    memberName: (r.group_members as { display_name?: string } | null)?.display_name ?? null,
    createdAt: r.created_at as string,
  }))
}

export async function revokeInvite(id: Id): Promise<void> {
  const { error } = await supabase().from('invites')
    .update({ status: 'revoked', responded_at: new Date().toISOString() }).eq('id', id)
  fail('Couldn’t withdraw that invitation', error)
}

/** Invitations addressed to the signed-in user, across every group. */
export async function myInvites(): Promise<Invite[]> {
  const { data, error } = await supabase().rpc('my_invites')
  if (error) return []          // signed out, or anonymous with no email
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as Id,
    groupId: r.group_id as Id,
    groupName: r.group_name as string,
    invitedByName: (r.invited_by_name as string) ?? null,
    memberName: (r.member_name as string) ?? null,
    createdAt: r.created_at as string,
  }))
}

export async function respondToInvite(id: Id, accept: boolean): Promise<void> {
  const { error } = await supabase().rpc('respond_to_invite', { p_invite: id, p_accept: accept })
  fail(accept ? 'Couldn’t accept that invitation' : 'Couldn’t decline that invitation', error)
}

// ── friends ──────────────────────────────────────────────────────────────

export interface Friend {
  id: Id            // their user id
  name: string
  email: string
}

/** People you have already split something with. */
export async function loadFriends(): Promise<Friend[]> {
  const { data, error } = await supabase()
    .from('friends').select('friend_id, display_name, email').order('display_name')
  if (error) return []          // signed out, or an anonymous guest
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.friend_id as Id,
    name: (r.display_name as string) || (r.email as string).split('@')[0],
    email: r.email as string,
  }))
}

/** Straight in, no invitation — you've shared a ledger with them before. */
export async function addFriendToGroup(groupId: Id, friendId: Id): Promise<Id> {
  const { data, error } = await supabase()
    .rpc('add_friend_to_group', { p_group: groupId, p_friend: friendId })
  fail('Couldn’t add them to the group', error)
  return data as Id
}
