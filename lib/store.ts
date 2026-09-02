'use client'
import { create } from 'zustand'
import type {
  ActivityDetail,
  Activity, Cadence, Category, Diff, Expense, Group, Id, LineItem, Message,
  Patch, Person, Recurring, Settlement, SplitMode, Transfer,
} from './types'
import { computeDiff, isAmendable, mergePatches, sameTarget } from './proposal'
import { computeShares } from './split'
import { rememberChoice, scenarioById, type Scenario } from './scenarios'
import { toMinor } from './money'
import { useAgentActivity } from './webmcp/activity'
import { formatMinor } from './money'
import * as repo from './repo'
import { hueFor } from './palette'

export interface NewExpense {
  groupId: Id
  description: string
  payerId: Id
  totalMinor: number
  participants: Id[]
  splitMode?: SplitMode
  category?: Category
  occurredAt?: string
  weights?: Record<Id, number>
  exact?: Record<Id, number>
  items?: LineItem[]
  taxMinor?: number
  tipMinor?: number
  receiptDataUrl?: string | null
  /** Already in storage — an agent uploads when it reads the bill, not when
   *  the proposal is accepted. */
  receiptPath?: string | null
  rationale?: string[]
  createdBy?: 'human' | 'agent'
  currency?: string
  fxRate?: number
}

interface State {
  you: Id | null
  yourName: string
  status: 'loading' | 'ready' | 'error'
  error: string | null
  groups: Group[]
  expenses: Expense[]
  settlements: Settlement[]
  activity: Activity[]
  recurring: Recurring[]
  messages: Message[]

  /**
   * What the user is currently looking at. Tools read this so an agent
   * inherits the on-screen context instead of having to be told.
   */
  openGroupId: Id | null
  openView: 'expenses' | 'balances' | 'insights' | 'activity'
  /** When a proposal was last accepted or declined, so a screen can tell a
   *  decision's own result from a stale one arriving after you moved on. */
  decidedAt: number
  focusedExpenseId: Id | null
  /** Bumped on every focus request, so pointing at the same expense twice works. */
  focusNonce: number
  setOpenGroup: (id: Id | null) => void
  setOpenView: (v: 'expenses' | 'balances' | 'insights' | 'activity') => void
  focusExpense: (id: Id | null) => void

  load: (userId: string, displayName: string) => Promise<void>
  clear: () => void
  /** null while auth is still resolving. */
  signedIn: boolean | null
  setSignedIn: (v: boolean | null) => void
  /**
   * Client-side navigation, handed in by a component that has the router.
   * Tools live outside React, and pushState alone doesn't drive the App Router.
   */
  navigate: ((path: string) => void) | null
  setNavigate: (fn: (path: string) => void) => void

  /**
   * Start a group. `friendIds` go straight in; `emails` are invited and appear
   * only once they accept; `names` are placeholder seats for people who don't
   * use Tabby at all, and can be claimed later from the share link.
   */
  createGroup: (
    name: string, emoji: string,
    people: { friendIds?: Id[]; emails?: string[]; names?: string[] },
  ) => Promise<Id>
  /** Builds a ready-made situation with you cast as one of its people. */
  loadScenario: (scenarioId: string, youAre: string) => Promise<Id>
  renameGroup: (groupId: Id, name: string, emoji: string) => Promise<void>
  deleteGroup: (groupId: Id) => Promise<void>
  restoreGroup: (groupId: Id) => Promise<void>
  restoreExpense: (id: Id) => Promise<void>
  /** Invitations addressed to the signed-in user, across every group. */
  invites: repo.Invite[]
  loadInvites: () => Promise<void>
  /** People you have split with before — addable to a group in one tap. */
  friends: repo.Friend[]
  loadFriends: () => Promise<void>
  addFriend: (groupId: Id, friendId: Id) => Promise<void>
  invite: (groupId: Id, email: string, memberId?: Id | null) => Promise<void>
  answerInvite: (inviteId: Id, accept: boolean) => Promise<void>
  setYourName: (name: string) => Promise<void>
  addMember: (groupId: Id, name: string) => Promise<void>
  removeMember: (groupId: Id, personId: Id) => Promise<void>

  addExpense: (input: NewExpense) => Promise<Id>
  updateExpense: (id: Id, patch: Partial<Expense>, reason?: string) => Promise<void>
  assignItem: (expenseId: Id, itemId: Id, people: Id[]) => Promise<void>
  /** Applies a whole batch at once, so the shares never show a half-applied state. */
  /** `provenance` says whether a person did this by hand or an agent proposed
   *  it — the log is worth little without that. */
  assignItems: (
    expenseId: Id,
    assignments: { itemId: Id; hadBy: Id[] }[],
    provenance?: { via: 'hand' | 'agent'; reason?: string },
  ) => Promise<void>
  deleteExpense: (id: Id) => Promise<void>

  settle: (groupId: Id, t: Transfer, note?: string) => Promise<void>
  addRecurring: (r: Omit<Recurring, 'id' | 'active'>) => Promise<void>
  materialise: (recurringId: Id) => Promise<void>
  stopRecurring: (recurringId: Id) => Promise<void>
  unsettle: (settlementId: Id) => Promise<void>
  replaceReceipt: (expenseId: Id, groupId: Id, dataUrl: string) => Promise<void>

  /** The seat id that is *you* inside a particular group. */
  meIn: (groupId: Id) => Id | null
  note: (
    groupId: Id, kind: Activity['kind'], summary: string,
    opts?: { amountMinor?: number | null; expenseId?: Id | null; detail?: ActivityDetail },
  ) => Promise<void>

  // ── conversation ───────────────────────────────────────────────────
  say: (groupId: Id, expenseId: Id | null, body: string) => Promise<void>
  /** An agent proposing a change. Returns the message id. */
  propose: (groupId: Id, expenseId: Id | null, body: string, patch: Patch) => Promise<Message>
  accept: (messageId: Id) => Promise<void>
  /** `reason` is the agent's own words, kept with the change it made. */
  applyPatch: (groupId: Id, patch: Patch, reason?: string) => Promise<void>
  withdraw: (messageId: Id) => Promise<void>
  reject: (messageId: Id, note?: string) => Promise<void>
  mergeMessage: (m: Message) => void
  mergeActivity: (a: Activity) => void
  /** Refetch the ledger after someone else changed it. Debounced by the caller. */
  refresh: () => Promise<void>
  watchThreads: () => () => void
}

export const useApp = create<State>()((set, get) => ({
  you: null,
  yourName: 'You',
  status: 'loading',
  error: null,
  groups: [],
  expenses: [],
  settlements: [],
  activity: [],
  recurring: [],
  messages: [],
  invites: [],
  friends: [],
  openGroupId: null,
  openView: 'expenses',
  decidedAt: 0,
  focusedExpenseId: null,
  focusNonce: 0,
  signedIn: null,

  setSignedIn: (v) => set({ signedIn: v }),
  navigate: null,
  setNavigate: (fn) => set({ navigate: fn }),

  // Opening a different group starts on its expenses; leaving one (id: null,
  // e.g. stepping into an expense) keeps the tab so coming back returns to it.
  setOpenGroup: (id) =>
    set((s) => (id !== null && id !== s.openGroupId
      ? { openGroupId: id, openView: 'expenses' as const }
      : { openGroupId: id })),
  setOpenView: (v) => set({ openView: v }),
  focusExpense: (id) => set((s) => ({ focusedExpenseId: id, focusNonce: s.focusNonce + 1 })),

  load: async (userId, displayName) => {
    set({ status: 'loading', you: userId, yourName: displayName, error: null })
    try {
      const [name, data, invites, friends] = await Promise.all([
        repo.loadProfileName(displayName),
        repo.loadEverything(),
        // Never let these stop the app loading — an anonymous guest has no
        // address, so both legitimately come back empty for them.
        repo.myInvites().catch(() => []),
        repo.loadFriends().catch(() => []),
      ])
      const messages = await repo.loadMessages(data.groups.map((g) => g.id))
      set({ ...data, messages, invites, friends, yourName: name, status: 'ready' })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Something went wrong.' })
    }
  },

  clear: () => set({
    you: null, groups: [], expenses: [], settlements: [],
    activity: [], recurring: [], messages: [], invites: [], friends: [],
    openGroupId: null, focusedExpenseId: null, focusNonce: 0, status: 'loading',
  }),

  /** Records what happened, without ever letting the log break the action. */
  say: async (groupId, expenseId, body) => {
    const text = body.trim()
    if (!text) return
    const m = await repo.postMessage({
      groupId, expenseId, authorMember: get().meIn(groupId), body: text,
    })
    // Merge rather than append: on a slow connection the realtime echo of our
    // own insert can arrive before the insert's own response does, and a bare
    // append would then show the message twice.
    get().mergeMessage(m)
  },

  /**
   * An agent asking for a change. The diff is computed now and stored, so what
   * someone approves later is exactly what they were shown.
   */
  propose: async (groupId, expenseId, body, patch) => {
    const s = get()
    const group = s.groups.find((g) => g.id === groupId)
    if (!group) throw new Error('That group no longer exists.')
    const me = s.meIn(groupId)
    const nameOf = (id: Id) =>
      id === me ? 'You' : group.members.find((m) => m.id === id)?.name ?? 'Someone'

    const diff = computeDiff(
      patch, group,
      s.expenses.filter((e) => e.groupId === groupId),
      s.settlements.filter((x) => x.groupId === groupId),
      nameOf,
    )

    // Is there already a draft of *mine* about this same thing?
    //
    // Ownership matters: folding Ravi's suggestion into Arjun's draft would let
    // one person silently edit another's proposal while Arjun's name stayed on
    // it. Another member's agent gets its own draft, and both stand.
    const open = s.messages.find(
      (x) => x.groupId === groupId && x.kind === 'proposal'
        && x.status === 'pending' && x.patch && sameTarget(x.patch, patch)
        && x.authorMember === me,
    )

    // Amend it rather than replace it. "Take Meera off the non-veg" and "but
    // she had the mutton" are two halves of one intent; replacing the first
    // would silently drop it and leave the second changing nothing.
    if (open?.patch && isAmendable(patch.kind)) {
      const mergedPatch = mergePatches(open.patch, patch)
      const mergedDiff = computeDiff(
        mergedPatch, group,
        s.expenses.filter((e) => e.groupId === groupId),
        s.settlements.filter((x) => x.groupId === groupId),
        nameOf,
      )
      const revisions = [...open.revisions, { body, at: new Date().toISOString() }]
      const amended: Message = {
        ...open, patch: mergedPatch, diff: mergedDiff, body, revisions,
      }
      set((st) => ({ messages: st.messages.map((x) => (x.id === open.id ? amended : x)) }))
      await repo.amendProposal(open.id, mergedPatch, mergedDiff, body, revisions)
      void get().note(groupId, 'proposal_made', `Agent adjusted: ${body}`, { expenseId })
      return amended
    }

    // Indivisible changes — settling, deleting, adding — replace instead.
    if (open) {
      set((st) => ({
        messages: st.messages.map((x) =>
          x.id === open.id
            ? { ...x, status: 'superseded' as const, resolvedAt: new Date().toISOString() }
            : x),
      }))
      await repo.supersedeProposals([open.id])
    }

    const m = await repo.postMessage({
      groupId, expenseId, authorMember: me, authorKind: 'agent',
      kind: 'proposal', body, patch, diff,
    })
    get().mergeMessage(m)
    void get().note(groupId, 'proposal_made', `Agent suggested: ${body}`, { expenseId })
    return m
  },

  accept: async (messageId) => {
    set({ decidedAt: Date.now() })
    const s = get()
    const m = s.messages.find((x) => x.id === messageId)
    if (!m || m.kind !== 'proposal' || m.status !== 'pending' || !m.patch) return
    const me = s.meIn(m.groupId)

    // Mark it first so a slow apply can't be double-accepted from two devices.
    await repo.resolveProposal(m.id, 'accepted', me)
    void get().note(m.groupId, 'proposal_accepted', `Accepted: ${m.body}`, { expenseId: m.expenseId })
    set((st) => ({
      messages: st.messages.map((x) =>
        x.id === m.id
          ? { ...x, status: 'accepted' as const, resolvedBy: me, resolvedAt: new Date().toISOString() }
          : x),
    }))
    await get().applyPatch(m.groupId, m.patch, m.body)

    // Show the change landing. The diff was computed when the proposal was
    // made, so this is exactly the movement the person just approved.
    const activity = useAgentActivity.getState()
    if (m.patch.kind === 'assign_items') {
      activity.touch(m.patch.assignments.map((a) => a.itemId), 90)
    }
    activity.touch(m.expenseId ?? m.groupId)
    if (m.diff) {
      const moved: Record<Id, number> = {}
      for (const id of Object.keys({ ...m.diff.before, ...m.diff.after })) {
        const d = (m.diff.after[id] ?? 0) - (m.diff.before[id] ?? 0)
        if (d !== 0) moved[id] = d
      }
      activity.delta(moved)
      activity.touch(Object.keys(moved))
    }
  },

  reject: async (messageId, note) => {
    set({ decidedAt: Date.now() })
    const s = get()
    const m = s.messages.find((x) => x.id === messageId)
    if (!m || m.status !== 'pending') return
    const me = s.meIn(m.groupId)
    await repo.resolveProposal(m.id, 'rejected', me, note)
    void get().note(
      m.groupId, 'proposal_rejected',
      note ? `Declined: ${m.body} — “${note}”` : `Declined: ${m.body}`,
      { expenseId: m.expenseId },
    )
    set((st) => ({
      messages: st.messages.map((x) =>
        x.id === m.id
          ? { ...x, status: 'rejected' as const, resolvedBy: me, resolvedAt: new Date().toISOString(), resolutionNote: note ?? null }
          : x),
    }))
  },

  /** Runs an approved patch through the same actions a person's clicks use. */
  applyPatch: async (groupId, patch, reason) => {
    const s = get()
    if (patch.kind === 'assign_items') {
      await s.assignItems(patch.expenseId, patch.assignments, { via: 'agent', reason })
    } else if (patch.kind === 'update_expense') {
      await s.updateExpense(patch.expenseId, patch.fields)
    } else if (patch.kind === 'add_expense') {
      await s.addExpense({ groupId, ...patch.input, createdBy: 'agent' })
    } else if (patch.kind === 'delete_expense') {
      await s.deleteExpense(patch.expenseId)
    } else if (patch.kind === 'settle') {
      await s.settle(groupId, { from: patch.from, to: patch.to, amountMinor: patch.amountMinor })
    }
  },

  /** Takes back a draft you proposed. Only the proposer may. */
  withdraw: async (messageId) => {
    const s = get()
    const m = s.messages.find((x) => x.id === messageId)
    if (!m || m.kind !== 'proposal' || m.status !== 'pending') return
    const me = s.meIn(m.groupId)
    if (m.authorMember !== me) {
      throw new Error('Only the person who proposed it can withdraw it. You can decline it instead.')
    }
    set((st) => ({
      messages: st.messages.map((x) =>
        x.id === m.id
          ? { ...x, status: 'withdrawn' as const, resolvedBy: me, resolvedAt: new Date().toISOString() }
          : x),
    }))
    await repo.resolveProposal(m.id, 'withdrawn', me)
    void get().note(m.groupId, 'proposal_rejected', `Withdrew: ${m.body}`, { expenseId: m.expenseId })
  },

  mergeActivity: (a) =>
    set((s) => (s.activity.some((x) => x.id === a.id)
      ? s
      : { activity: [a, ...s.activity] })),

  mergeMessage: (m) =>
    set((s) => {
      const have = s.messages.find((x) => x.id === m.id)
      // Echoes can arrive out of order — the INSERT of a draft we have already
      // withdrawn, say. A decision is final, so never let one be undone by a
      // stale row describing the same message before it was resolved.
      if (have && have.status !== 'pending' && m.status === 'pending') return s
      return {
        messages: have
          ? s.messages.map((x) => (x.id === m.id ? m : x))
          : [...s.messages, m],
      }
    }),

  refresh: async () => {
    try {
      const data = await repo.loadEverything()
      const messages = await repo.loadMessages(data.groups.map((g) => g.id))
      set({ ...data, messages })
    } catch {
      // A failed background refresh must never break what's on screen.
    }
  },

  watchThreads: () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = repo.watchGroups(get().groups.map((g) => g.id), {
      onMessage: (m) => get().mergeMessage(m),
      onMessageGone: (id) =>
        set((s) => ({ messages: s.messages.filter((x) => x.id !== id) })),
      onActivity: (a) => get().mergeActivity(a),
      onLedgerChange: () => {
        // A single accept fires several row events; coalesce them.
        clearTimeout(timer)
        timer = setTimeout(() => void get().refresh(), 250)
      },
    })
    return () => { clearTimeout(timer); stop() }
  },

  note: async (groupId, kind, summary, opts = {}) => {
    const entry = await repo.logActivity(groupId, kind, summary, {
      actorMember: get().meIn(groupId),
      amountMinor: opts.amountMinor,
      expenseId: opts.expenseId,
      detail: opts.detail,
    })
    if (entry) get().mergeActivity(entry)
  },

  meIn: (groupId) => {
    const { groups, you } = get()
    const g = groups.find((x) => x.id === groupId)
    return g?.members.find((m) => m.userId === you)?.id ?? g?.members[0]?.id ?? null
  },

  createGroup: async (name, emoji, people) => {
    const names = (people.names ?? []).map((n) => n.trim()).filter(Boolean)
    const group = await repo.createGroup(name, emoji, get().yourName, names)
    set((s) => ({ groups: [group, ...s.groups] }))
    void get().note(group.id, 'group_created', `Created ${group.name}`)

    // Friends are simply in. An address you haven't split with yet gets an
    // invitation instead, because the first time should be their decision.
    for (const friendId of people.friendIds ?? []) {
      try { await repo.addFriendToGroup(group.id, friendId) } catch { /* keep going */ }
    }
    for (const email of people.emails ?? []) {
      try { await get().invite(group.id, email) } catch { /* keep going */ }
    }
    if ((people.friendIds ?? []).length > 0) await get().refresh()
    return group.id
  },

  renameGroup: async (groupId, name, emoji) => {
    set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, name, emoji } : g)) }))
    await repo.renameGroup(groupId, name, emoji)
  },

  // Nothing is destroyed — the row is marked, so undo brings back the same
  // group with its expenses, its history and everyone's balances intact.
  deleteGroup: async (groupId) => {
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== groupId),
      expenses: s.expenses.filter((e) => e.groupId !== groupId),
      settlements: s.settlements.filter((x) => x.groupId !== groupId),
    }))
    await repo.deleteGroup(groupId)
  },

  restoreGroup: async (groupId) => {
    await repo.restoreGroup(groupId)
    await get().refresh()
  },

  restoreExpense: async (id) => {
    await repo.restoreExpense(id)
    await get().refresh()
    const back = get().expenses.find((e) => e.id === id)
    if (back) void get().note(back.groupId, 'expense_added', `Brought back “${back.description}”`,
      { amountMinor: back.totalMinor, expenseId: back.id })
  },

  loadInvites: async () => {
    try { set({ invites: await repo.myInvites() }) } catch { set({ invites: [] }) }
  },

  loadFriends: async () => {
    try { set({ friends: await repo.loadFriends() }) } catch { set({ friends: [] }) }
  },

  addFriend: async (groupId, friendId) => {
    await repo.addFriendToGroup(groupId, friendId)
    await get().refresh()
    const who = get().friends.find((f) => f.id === friendId)
    if (who) void get().note(groupId, 'member_added', `Added ${who.name}`)
  },

  invite: async (groupId, email, memberId = null) => {
    const me = get().meIn(groupId)
    await repo.inviteByEmail(groupId, email, me, memberId ?? null)
    void get().note(groupId, 'member_added', `Invited ${email.trim().toLowerCase()}`)
  },

  answerInvite: async (inviteId, accept) => {
    const invitation = get().invites.find((i) => i.id === inviteId)
    await repo.respondToInvite(inviteId, accept)
    set((s) => ({ invites: s.invites.filter((i) => i.id !== inviteId) }))
    if (accept) {
      await get().refresh()
      // Joining makes you friends with everyone already there, so the next
      // group they make can include you in one tap.
      await get().loadFriends()
      if (invitation) void get().note(invitation.groupId, 'member_added', 'Joined the group')
    }
  },

  /** Renames you everywhere: your profile and your seat in each group. */
  setYourName: async (name) => {
    const { you, groups } = get()
    if (!you) return
    set({ yourName: name })
    set({
      groups: groups.map((g) => ({
        ...g,
        members: g.members.map((m) => (m.userId === you ? { ...m, name } : m)),
      })),
    })
    await repo.setDisplayName(name)
    const seats = groups.flatMap((g) => g.members.filter((m) => m.userId === you).map((m) => m.id))
    await Promise.all(seats.map((id) => repo.renameMember(id, name)))
  },

  /**
   * You are cast as one of the scenario's people, not appended to it — the
   * meat-bill argument only lands if you're the vegetarian being charged.
   */
  loadScenario: async (scenarioId, youAre) => {
    const scenario = scenarioById(scenarioId)
    if (!scenario) throw new Error('No such scenario.')
    if (!scenario.cast.includes(youAre)) throw new Error(`${youAre} isn’t in this scenario.`)

    await get().setYourName(youAre)
    const others = scenario.cast.filter((n) => n !== youAre)
    const groupId = await get().createGroup(scenario.title, scenario.emoji, { names: others })

    const group = get().groups.find((g) => g.id === groupId)!
    const seat = (name: string) => {
      const id = name === youAre
        ? group.members.find((m) => m.userId === get().you)?.id
        : group.members.find((m) => m.name === name)?.id
      if (!id) throw new Error(`Couldn’t place ${name} in the group.`)
      return id
    }

    // Slide the whole trip back to the week where its anchored expense falls
    // on the weekday its description claims. Without this, "Saturday dinner"
    // is a Saturday only when you happen to load the scenario on a Wednesday.
    const shift = (() => {
      const a = scenario.anchor
      if (!a) return 0
      const today = new Date().getDay()
      return (((today - a.daysAgo - a.weekday) % 7) + 7) % 7
    })()

    const day = (n: number) => {
      const d = new Date(Date.now() - (n + shift) * 86_400_000)
      d.setHours(19, 0, 0, 0)
      return d.toISOString()
    }

    for (const e of [...scenario.expenses].reverse()) {
      const participants = (e.between ?? scenario.cast).map(seat)
      const items = e.items?.map((it, i) => ({
        id: `si_${i}_${Math.random().toString(36).slice(2, 6)}`,
        label: it.label,
        amountMinor: toMinor(it.amount),
        eatenBy: (it.hadBy ?? []).map(seat),
      }))
      const subtotal = (e.items ?? []).reduce((sum, it) => sum + toMinor(it.amount), 0)
      await get().addExpense({
        groupId,
        description: e.description,
        payerId: seat(e.paidBy),
        totalMinor: e.items ? subtotal + toMinor(e.tax ?? 0) + toMinor(e.tip ?? 0) : toMinor(e.amount),
        participants,
        splitMode: e.splitMode ?? 'equal',
        category: e.category,
        occurredAt: day(e.daysAgo),
        weights: e.weights
          ? Object.fromEntries(Object.entries(e.weights).map(([n, w]) => [seat(n), w]))
          : undefined,
        items,
        taxMinor: toMinor(e.tax ?? 0),
        tipMinor: toMinor(e.tip ?? 0),
        currency: e.currency,
        fxRate: e.rate,
        rationale: e.note ? [e.note] : undefined,
      })
    }

    for (const st of scenario.settlements ?? []) {
      await get().settle(groupId, {
        from: seat(st.from), to: seat(st.to), amountMinor: toMinor(st.amount),
      })
    }

    rememberChoice({ scenarioId, you: youAre, groupId })
    return groupId
  },

  addMember: async (groupId, name) => {
    const group = get().groups.find((g) => g.id === groupId)
    const person = await repo.addMember(groupId, name, hueFor(group?.members.length ?? 0))
    set((s) => ({
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, members: [...g.members, person] } : g)),
    }))
    void get().note(groupId, 'member_added', `Added ${name}`)
  },

  removeMember: async (groupId, personId) => {
    const gone = get().groups.find((g) => g.id === groupId)?.members.find((m) => m.id === personId)
    await repo.removeMember(personId)
    if (gone) void get().note(groupId, 'member_removed', `Removed ${gone.name}`)
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, members: g.members.filter((m) => m.id !== personId) } : g,
      ),
    }))
  },

  addExpense: async (input) => {
    // Either the caller hands over the image and we upload it, or it was
    // uploaded already — an agent's proposal carries the path, because the
    // photo goes to storage when the bill is read, not when it's accepted.
    let receiptPath: string | null = input.receiptPath ?? null
    if (!receiptPath && input.receiptDataUrl) {
      receiptPath = await repo.uploadReceipt(input.groupId, input.receiptDataUrl)
    }
    const expense = await repo.createExpense({
      groupId: input.groupId,
      description: input.description,
      payerId: input.payerId,
      totalMinor: input.totalMinor,
      participants: input.participants,
      splitMode: input.splitMode ?? 'equal',
      category: input.category ?? 'other',
      occurredAt: input.occurredAt,
      weights: input.weights,
      exact: input.exact,
      items: input.items,
      taxMinor: input.taxMinor,
      tipMinor: input.tipMinor,
      currency: input.currency,
      fxRate: input.fxRate,
      receiptPath,
      rationale: input.rationale,
      createdByKind: input.createdBy ?? 'human',
    })
    set((s) => ({ expenses: [expense, ...s.expenses] }))
    void get().note(input.groupId, 'expense_added', `Added “${input.description}”`, {
      amountMinor: expense.baseTotalMinor || expense.totalMinor,
      expenseId: expense.id,
    })
    return expense.id
  },

  updateExpense: async (id, patch, reason) => {
    const current = get().expenses.find((e) => e.id === id)
    const rationale = reason && current ? [...current.rationale, reason] : undefined
    const full = rationale ? { ...patch, rationale } : patch
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...full } : e)) }))
    await repo.updateExpense(id, full)
    if (current) {
      void get().note(current.groupId, 'expense_edited', `Edited “${current.description}”`,
        { expenseId: current.id })
    }
    if (patch.items !== undefined) {
      const saved = await repo.replaceItems(id, patch.items ?? [])
      set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? { ...e, items: saved } : e)) }))
    }
  },

  // One tap on one person. Goes through the same path as an agent's batch so
  // the history records it the same way — the log shouldn't be able to tell
  // you less about a change just because a person made it by hand.
  assignItem: (expenseId, itemId, people) =>
    get().assignItems(expenseId, [{ itemId, hadBy: people }], { via: 'hand' }),

  assignItems: async (expenseId, assignments, provenance) => {
    const before = get().expenses.find((x) => x.id === expenseId)
    const group = before ? get().groups.find((g) => g.id === before.groupId) : undefined
    const nameOf = (id: Id) => group?.members.find((m) => m.id === id)?.name ?? 'someone'
    const sharesOf = (e: Expense | undefined) =>
      e ? computeShares(e) : {}
    const sharesBefore = sharesOf(before)

    const by = new Map(assignments.map((a) => [a.itemId, a.hadBy]))
    set((s) => ({
      expenses: s.expenses.map((e) =>
        e.id === expenseId
          ? { ...e, items: e.items?.map((i) => (by.has(i.id) ? { ...i, eatenBy: by.get(i.id)! } : i)) }
          : e),
    }))
    await Promise.all(assignments.map((a) => repo.setItemEaters(a.itemId, a.hadBy)))

    const e = get().expenses.find((x) => x.id === expenseId)
    if (!e || !before) return

    // Record the change itself, not just that one happened. "Priya came off
    // the Serradura" is the thing someone wants when they open the history —
    // and the thing an agent needs to answer "why does Ravi owe this".
    const items = assignments.flatMap((a) => {
      const was = before.items?.find((i) => i.id === a.itemId)
      if (!was) return []
      const everyone = before.participants
      const oldSet = new Set(was.eatenBy.length ? was.eatenBy : everyone)
      const newSet = new Set(a.hadBy.length ? a.hadBy : everyone)
      const added = [...newSet].filter((p) => !oldSet.has(p)).map(nameOf)
      const removed = [...oldSet].filter((p) => !newSet.has(p)).map(nameOf)
      return added.length || removed.length ? [{ label: was.label, added, removed }] : []
    })

    const sharesAfter = sharesOf(e)
    const shares = Object.keys({ ...sharesBefore, ...sharesAfter })
      .map((id) => ({
        name: nameOf(id),
        beforeMinor: sharesBefore[id] ?? 0,
        afterMinor: sharesAfter[id] ?? 0,
      }))
      .filter((r) => r.beforeMinor !== r.afterMinor)

    // One item moving reads better as the sentence it is.
    const only = items.length === 1 ? items[0] : null
    const who = only
      ? [...only.removed.map((n) => `${n} came off`), ...only.added.map((n) => `${n} went on`)].join(', ')
      : ''
    const summary = only && who
      ? `${who} ${only.label} on “${e.description}”`
      : `Changed who had ${items.length || assignments.length} items on “${e.description}”`

    void get().note(e.groupId, 'expense_edited', summary, {
      expenseId: e.id,
      detail: { via: provenance?.via ?? 'hand', items, shares, reason: provenance?.reason },
    })
  },

  deleteExpense: async (id) => {
    const gone = get().expenses.find((e) => e.id === id)
    // The database cascades the thread with the expense; mirror that locally
    // so an open draft doesn't linger in the queue pointing at nothing.
    set((s) => ({
      expenses: s.expenses.filter((e) => e.id !== id),
      messages: s.messages.filter((m) => m.expenseId !== id),
    }))
    await repo.deleteExpense(id)
    if (gone) void get().note(gone.groupId, 'expense_deleted', `Deleted “${gone.description}”`)
  },

  settle: async (groupId, t, note) => {
    const settlement = await repo.recordSettlement(groupId, t, note)
    set((s) => ({ settlements: [...s.settlements, settlement] }))
    const g = get().groups.find((x) => x.id === groupId)
    const nameOf = (id: Id) => g?.members.find((m) => m.id === id)?.name ?? 'Someone'
    void get().note(
      groupId, 'settlement_added',
      `${nameOf(t.from)} paid ${nameOf(t.to)} ${formatMinor(t.amountMinor, g?.currency ?? 'INR')}`,
      { amountMinor: t.amountMinor },
    )
  },

  addRecurring: async (r) => {
    const created = await repo.createRecurring(r)
    set((s) => ({ recurring: [...s.recurring, created] }))
  },

  /** Turns a due template into a real expense and rolls the schedule forward. */
  materialise: async (recurringId) => {
    const r = get().recurring.find((x) => x.id === recurringId)
    if (!r) return
    await get().addExpense({
      groupId: r.groupId,
      description: r.description,
      payerId: r.payerId,
      totalMinor: r.totalMinor,
      participants: r.participants,
      splitMode: r.splitMode,
      category: r.category,
      occurredAt: new Date(`${r.nextDue}T12:00:00`).toISOString(),
      weights: r.weights,
    })
    const next = new Date(`${r.nextDue}T12:00:00`)
    if (r.cadence === 'monthly') next.setMonth(next.getMonth() + 1)
    else next.setDate(next.getDate() + 7)
    const nextDue = next.toISOString().slice(0, 10)
    set((s) => ({ recurring: s.recurring.map((x) => (x.id === r.id ? { ...x, nextDue } : x)) }))
    await repo.advanceRecurring(r.id, nextDue)
  },

  stopRecurring: async (recurringId) => {
    set((s) => ({ recurring: s.recurring.filter((x) => x.id !== recurringId) }))
    await repo.stopRecurring(recurringId)
  },

  unsettle: async (settlementId) => {
    const gone = get().settlements.find((x) => x.id === settlementId)
    set((s) => ({ settlements: s.settlements.filter((x) => x.id !== settlementId) }))
    await repo.deleteSettlement(settlementId)
    if (gone) {
      void get().note(gone.groupId, 'settlement_undone', 'Undid a payment',
        { amountMinor: gone.amountMinor })
    }
  },

  replaceReceipt: async (expenseId, groupId, dataUrl) => {
    const path = await repo.uploadReceipt(groupId, dataUrl)
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === expenseId ? { ...e, receiptPath: path } : e)) }))
    await repo.setReceiptPath(expenseId, path)
  },

}))
