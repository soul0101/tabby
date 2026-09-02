import { useApp } from '@/lib/store'
import { fromMinor } from '@/lib/money'
import { seatOf } from '@/lib/me'
import type { Group, Id } from '@/lib/types'

/** Major units, rounded for display. Tool payloads never carry minor units. */
export const money = (minor: number) => Number(fromMinor(minor).toFixed(2))

/**
 * Which group a tool is talking about.
 *
 * Omitting `groupId` means "the one on screen". This is the whole reason the
 * tools live in the page: the agent inherits what the user is looking at,
 * which a backend integration has no way to know.
 */
export function resolveGroup(groupId?: unknown): Group {
  const s = useApp.getState()
  if (groupId) {
    const byId = s.groups.find((g) => g.id === groupId)
    if (byId) return byId
    const byName = s.groups.find(
      (g) => g.name.toLowerCase() === String(groupId).toLowerCase(),
    )
    if (byName) return byName
    throw new Error(
      `No group called "${groupId}". Yours are: ${s.groups.map((g) => g.name).join(', ') || 'none yet'}.`,
    )
  }
  const open = s.openGroupId ? s.groups.find((g) => g.id === s.openGroupId) : undefined
  if (open) return open
  if (s.groups.length === 1) return s.groups[0]
  throw new Error(
    `Which group? Open one, or pass groupId. Yours are: ${s.groups.map((g) => g.name).join(', ') || 'none yet'}.`,
  )
}

export const meSeat = (group: Group): Id | null => seatOf(group, useApp.getState().you)

/** Resolve people by id or name, case-insensitively, with a useful failure. */
export function resolvePeople(input: unknown, group: Group, label: string): Id[] {
  if (!Array.isArray(input)) throw new Error(`${label} must be a list of names.`)
  return input.map((raw) => {
    const needle = String(raw).trim().toLowerCase()
    const me = meSeat(group)
    if (needle === 'me' || needle === 'you' || needle === 'myself') {
      if (!me) throw new Error('You don’t have a seat in this group.')
      return me
    }
    const hit = group.members.find(
      (m) => m.id.toLowerCase() === needle || m.name.toLowerCase() === needle,
    )
    if (!hit) {
      throw new Error(
        `"${raw}" isn’t in ${group.name}. The people here are: ${group.members.map((m) => m.name).join(', ')}.`,
      )
    }
    return hit.id
  })
}

export const nameIn = (group: Group, id: Id) => {
  const me = meSeat(group)
  return id === me ? 'You' : group.members.find((m) => m.id === id)?.name ?? 'Someone'
}

export function requireExpense(id: unknown) {
  const e = useApp.getState().expenses.find((x) => x.id === id)
  if (!e) throw new Error(`No expense with id "${id}". Call list_expenses to see the ids.`)
  return e
}
