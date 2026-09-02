-- Conversation and proposals.
--
-- Money arguments happen in a thread, not a modal. A modal is ephemeral, only
-- the person at the screen sees it, it leaves no record, and it forces yes/no
-- with no room to counter. So every change an agent wants to make becomes a
-- durable proposal attached to the expense, with a visible diff, that anyone
-- in the group can accept, reject, or argue with — from their own phone, later.
--
-- The rule the whole design rests on: humans act, agents propose.

create type public.message_kind as enum ('comment', 'proposal', 'event');
create type public.proposal_status as enum ('pending', 'accepted', 'rejected', 'superseded');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  -- Null means the thread belongs to the group rather than one expense.
  expense_id uuid references public.expenses(id) on delete cascade,

  author_member uuid references public.group_members(id) on delete set null,
  author_user uuid references auth.users(id) on delete set null,
  -- Whether a person typed this or an agent did it on their behalf.
  author_kind text not null default 'human' check (author_kind in ('human', 'agent')),

  kind public.message_kind not null default 'comment',
  body text not null default '' check (length(body) <= 2000),

  -- proposal only ────────────────────────────────────────────────────────
  -- The change being proposed, as a structured patch the client can apply.
  patch jsonb,
  -- Precomputed before/after per member, so the diff renders without
  -- recomputing history and stays truthful even after the expense moves on.
  diff jsonb,
  status public.proposal_status,
  resolved_by uuid references public.group_members(id) on delete set null,
  resolved_at timestamptz,
  /* Why it was rejected, if someone said. */
  resolution_note text,

  created_at timestamptz not null default now(),

  -- A proposal must carry a patch and a status; a comment must not.
  constraint proposal_shape check (
    (kind = 'proposal' and patch is not null and status is not null)
    or (kind <> 'proposal' and patch is null and status is null)
  )
);

create index messages_expense_idx on public.messages (expense_id, created_at)
  where expense_id is not null;
create index messages_group_idx on public.messages (group_id, created_at desc);
create index messages_pending_idx on public.messages (group_id)
  where kind = 'proposal' and status = 'pending';

alter table public.messages enable row level security;

create policy messages_select on public.messages for select to authenticated
  using (private.is_group_member(group_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (private.is_group_member(group_id));
-- Resolving a proposal is an update; editing someone else's words is not, so
-- the client only ever writes the resolution columns.
create policy messages_update on public.messages for update to authenticated
  using (private.is_group_member(group_id))
  with check (private.is_group_member(group_id));
create policy messages_delete on public.messages for delete to authenticated
  using (private.is_group_member(group_id) and author_user = (select auth.uid()));

grant select, insert, update, delete on public.messages to authenticated;

-- Everyone in the group watches the same thread.
alter publication supabase_realtime add table public.messages;

-- A shared ledger has to actually be shared: when someone accepts a proposal
-- or adds an expense, everyone else's screen should follow without a reload.
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.expense_items;
alter publication supabase_realtime add table public.settlements;
alter publication supabase_realtime add table public.group_members;
