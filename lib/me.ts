import type { Group, Id } from './types'

/**
 * Which seat in this group is you.
 *
 * A member is a seat, not an account — most people in a group never sign in.
 * Only the seat carrying your user id is you, and only in groups you're in.
 */
export const seatOf = (group: Group, userId: Id | null): Id | null =>
  group.members.find((m) => m.userId && m.userId === userId)?.id ?? null

export const nameOf = (group: Group, id: Id, meSeat: Id | null): string =>
  id === meSeat ? 'You' : group.members.find((m) => m.id === id)?.name ?? 'Someone'
