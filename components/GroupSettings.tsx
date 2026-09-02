'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { PeoplePicker, emptyPicked, pickedCount, type Picked } from '@/components/PeoplePicker'
import { netBalances } from '@/lib/settle'
import type { Group } from '@/lib/types'
import { Shell } from '@/components/Shell'
import { ActionBar } from '@/components/ActionBar'
import { Amount, Avatar, Button, Card, EmptyState, Field, Label, inputClass } from '@/components/ui'
import { toast } from '@/components/Toast'
import { RecurringForm } from '@/components/RecurringForm'
import { seatOf } from '@/lib/me'
import { useMemo } from 'react'

const EMOJI = ['🌴', '🏠', '🎿', '🍛', '🎉', '🚀', '🏝', '🚗', '🎬', '🏕', '⚽', '🎓']

export function GroupSettingsPage({ groupId }: { groupId: string }) {
  const groups = useApp((s) => s.groups)
  const you = useApp((s) => s.you)
  const status = useApp((s) => s.status)
  const group = useMemo(() => groups.find((g) => g.id === groupId), [groups, groupId])
  const me = useMemo(() => (group ? seatOf(group, you) : null), [group, you])
  if (status === 'loading') {
    return (
      <Shell back={{ href: `/g/${groupId}`, label: 'Back' }}>
        <div className="h-40 animate-pulse rounded-[16px] bg-sunken" />
      </Shell>
    )
  }
  if (!group) {
    return (
      <Shell back={{ href: '/', label: 'Groups' }}>
        <Card><EmptyState title="Group not found" body="It may have been deleted." /></Card>
      </Shell>
    )
  }
  return <GroupSettings group={group} me={me} />
}

function GroupSettings({ group, me }: { group: Group; me: string | null }) {
  const renameGroup = useApp((s) => s.renameGroup)
  const addMember = useApp((s) => s.addMember)
  const removeMember = useApp((s) => s.removeMember)
  const deleteGroup = useApp((s) => s.deleteGroup)
  const restoreGroup = useApp((s) => s.restoreGroup)
  const invite = useApp((s) => s.invite)
  const addFriend = useApp((s) => s.addFriend)
  const expenses = useApp((s) => s.expenses).filter((e) => e.groupId === group.id)
  const settlements = useApp((s) => s.settlements).filter((s2) => s2.groupId === group.id)
  const router = useRouter()
  const back = `/g/${group.id}`

  const [name, setName] = useState(group.name)
  const [emoji, setEmoji] = useState(group.emoji)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [addingRepeat, setAddingRepeat] = useState(false)
  const [picked, setPicked] = useState<Picked>(emptyPicked)
  const [adding, setAdding] = useState(false)

  const addPeople = async () => {
    setAdding(true); setError(null)
    try {
      for (const id of picked.friendIds) await addFriend(group.id, id)
      for (const email of picked.emails) await invite(group.id, email)
      for (const name of picked.names) await addMember(group.id, name)
      const invited = picked.emails.length
      toast(
        invited > 0 && picked.friendIds.length + picked.names.length === 0
          ? `Invited ${picked.emails.join(', ')}`
          : `Added ${pickedCount(picked)} to ${group.name}`,
        { tone: 'success' })
      setPicked(emptyPicked)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add them.')
    } finally { setAdding(false) }
  }


  const inviteUrl = group.inviteToken && typeof window !== 'undefined'
    ? `${window.location.origin}/join/${group.inviteToken}`
    : null

  const copyInvite = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true); setTimeout(() => setCopied(false), 2200)
      toast('Invite link copied', { tone: 'success' })
    } catch {
      toast('Couldn’t copy — select the link and copy it', { tone: 'error' })
    }
  }

  const balances = netBalances(expenses, settlements)
  const usedBy = (id: string) => expenses.some((e) => e.participants.includes(id) || e.payerId === id)

  const save = async () => {
    if (!name.trim()) { setError('The group needs a name.'); return }
    if (name !== group.name || emoji !== group.emoji) {
      await renameGroup(group.id, name.trim(), emoji)
      toast('Group updated', { tone: 'success' })
    }
    router.push(back)
  }

  const remove = async (id: string, personName: string) => {
    if (usedBy(id)) {
      toast(`${personName} is on some expenses — remove those first.`, { tone: 'error' })
      return
    }
    await removeMember(group.id, id)
  }

  return (
    <Shell back={{ href: back, label: group.name }}
      title={<span className="text-[15px] font-semibold">Settings</span>}>
      <div className="grid gap-5">
        <Field label="Name" htmlFor="gname" error={error ?? undefined}>
          <input
            id="gname" value={name} autoComplete="off" data-autofocus
            onChange={(e) => { setName(e.target.value); setError(null) }}
            className={inputClass}
          />
        </Field>

        <div>
          <Label className="mb-2">Icon</Label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI.map((e) => (
              <button
                key={e} type="button" onClick={() => setEmoji(e)} aria-pressed={emoji === e} aria-label={`Icon ${e}`}
                className={`emoji grid h-10 w-10 place-items-center rounded-[11px] border text-[18px] transition-all ${
                  emoji === e ? 'border-ink bg-sunken scale-105' : 'border-line hover:border-line-2'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2">People · {group.members.length}</Label>
          <ul className="grid gap-1">
            {group.members.map((m) => {
              const v = balances[m.id] ?? 0
              return (
                <li key={m.id} className="flex items-center gap-3 py-1.5">
                  <Avatar person={m} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">
                      {m.id === me ? 'You' : m.name}
                    </span>
                    <span className="text-[12.5px] text-ink-3">
                      {v === 0 ? 'all square' : (
                        <>
                          {v > 0 ? 'is owed ' : 'owes '}
                          <Amount minor={Math.abs(v)} currency={group.currency} size="sm"
                            tone={v > 0 ? 'positive' : 'negative'} />
                        </>
                      )}
                    </span>
                  </span>
                  {m.id !== me && (
                    <Button size="sm" variant="ghost" onClick={() => void remove(m.id, m.name)}>Remove</Button>
                  )}
                </li>
              )
            })}
          </ul>

        </div>

        <div>
          <Label className="mb-2">Add someone</Label>
          <PeoplePicker
            value={picked}
            onChange={setPicked}
            exclude={group.members.map((m) => m.userId).filter(Boolean) as string[]}
          />
          {pickedCount(picked) > 0 && (
            <Button className="mt-3" variant="primary" disabled={adding}
              onClick={() => void addPeople()}>
              {adding ? 'Adding…' : `Add ${pickedCount(picked)} to ${group.name}`}
            </Button>
          )}
        </div>

        {inviteUrl && (
          <div>
            <Label className="mb-2">Or share a link</Label>
            <p className="mb-2 text-[13px] leading-relaxed text-ink-3 text-pretty">
              Anyone with this link can join and claim their spot. They’ll see everything in the group.
            </p>
            <div className="flex gap-2">
              <input
                readOnly value={inviteUrl} aria-label="Invite link"
                onFocus={(e) => e.currentTarget.select()}
                className={`${inputClass} tnum text-[12.5px] text-ink-2`}
              />
              <Button onClick={() => void copyInvite()}>{copied ? 'Copied' : 'Copy'}</Button>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <Label>Repeating expenses</Label>
            <Button size="sm" variant="ghost" onClick={() => setAddingRepeat(true)}>Add one</Button>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3 text-pretty">
            For rent or the wifi bill. Tabby reminds you when one’s due — it never adds a charge on its own.
          </p>
          {addingRepeat && (
            <div className="mt-3">
              <RecurringForm group={group} me={me} onClose={() => setAddingRepeat(false)} />
            </div>
          )}
        </div>

        {!confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="justify-self-start text-[13.5px] font-semibold text-negative underline underline-offset-2"
          >
            Delete this group
          </button>
        )}
      </div>
      {confirmDelete ? (
        <ActionBar>
          <Button className="flex-1" onClick={() => setConfirmDelete(false)}>Keep it</Button>
          <Button className="flex-1" variant="danger"
            onClick={async () => {
              const { id, name: gone } = group
              await deleteGroup(id)
              router.push('/')
              // Soft delete, so undo returns the same group with every
              // expense, settlement and balance exactly as it was.
              toast(`Deleted “${gone}”`, {
                undo: async () => { await restoreGroup(id); toast('Put it back', { tone: 'success' }) },
              })
            }}>
            Delete {group.name}
          </Button>
        </ActionBar>
      ) : (
        <ActionBar>
          <Button className="flex-1" onClick={() => router.push(back)}>Cancel</Button>
          <Button className="flex-1" variant="primary" onClick={() => void save()}>Save</Button>
        </ActionBar>
      )}

    </Shell>
  )
}
