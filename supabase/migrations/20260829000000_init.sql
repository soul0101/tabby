-- Tabby: groups, the people in them, expenses, and settlements.
--
-- Membership model: a group member is a *seat*, not necessarily an account.
-- You add friends by name and they owe money immediately; `user_id` is filled
-- in later if and when that person signs in and claims the seat. This is the
-- difference between an app people actually use on a trip and one where
-- everybody has to sign up before dinner can be split.

create extension if not exists "pgcrypto";

-- ── helper schema, deliberately not exposed to the Data API ──────────────
create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- ── profiles ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'You',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Anonymous users have no email, and 'friend' read as a real name in the UI.
  -- 'You' is honest until the person sets one.
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'You'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── groups ───────────────────────────────────────────────────────────────
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  emoji text not null default '💸',
  currency text not null default 'INR' check (length(currency) = 3),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  hue smallint not null default 25,
  -- Null until this person signs in and claims their seat.
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index group_members_group_id_idx on public.group_members (group_id);
create index group_members_user_id_idx on public.group_members (user_id) where user_id is not null;

-- ── expenses ─────────────────────────────────────────────────────────────
create type public.split_mode as enum ('equal', 'shares', 'exact', 'items');
create type public.extras_policy as enum ('proportional', 'equal');

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  payer_id uuid not null references public.group_members(id) on delete restrict,
  description text not null check (length(trim(description)) between 1 and 140),
  category text not null default 'other',
  occurred_at timestamptz not null default now(),
  currency text not null default 'INR',

  split_mode public.split_mode not null default 'equal',
  -- Minor units (paise). Never a float, anywhere.
  total_minor bigint not null default 0 check (total_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  tip_minor bigint not null default 0 check (tip_minor >= 0),
  extras_policy public.extras_policy not null default 'proportional',

  -- participants: member ids. weights/exact: member id -> number.
  participants uuid[] not null default '{}',
  weights jsonb not null default '{}'::jsonb,
  exact jsonb not null default '{}'::jsonb,

  receipt_path text,
  note text,
  rationale text[] not null default '{}',
  needs_review text,
  created_by_kind text not null default 'human' check (created_by_kind in ('human', 'agent')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index expenses_group_id_occurred_at_idx on public.expenses (group_id, occurred_at desc);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 140),
  amount_minor bigint not null check (amount_minor >= 0),
  -- Empty means shared by everyone on the expense.
  eaten_by uuid[] not null default '{}',
  position integer not null default 0
);

create index expense_items_expense_id_idx on public.expense_items (expense_id, position);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_member uuid not null references public.group_members(id) on delete restrict,
  to_member uuid not null references public.group_members(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  settled_at timestamptz not null default now(),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  check (from_member <> to_member)
);

create index settlements_group_id_idx on public.settlements (group_id);

-- ── membership predicate ─────────────────────────────────────────────────
-- SECURITY DEFINER so a policy on group_members can ask "is the caller in
-- this group?" without recursing into its own policy. It lives in `private`
-- so it is not callable through the Data API, and it checks auth.uid()
-- itself rather than trusting an argument.
create or replace function private.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = gid
      and gm.user_id = (select auth.uid())
  );
$$;

create or replace function private.owns_group(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and g.created_by = (select auth.uid())
  );
$$;

-- ── row level security ───────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_items  enable row level security;
alter table public.settlements    enable row level security;

-- profiles: you see and edit only your own.
create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- groups
create policy groups_select on public.groups for select to authenticated
  using (private.is_group_member(id) or created_by = (select auth.uid()));
create policy groups_insert on public.groups for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy groups_update on public.groups for update to authenticated
  using (private.is_group_member(id)) with check (private.is_group_member(id));
create policy groups_delete on public.groups for delete to authenticated
  using (created_by = (select auth.uid()));

-- group_members
create policy group_members_select on public.group_members for select to authenticated
  using (private.is_group_member(group_id) or private.owns_group(group_id));
create policy group_members_insert on public.group_members for insert to authenticated
  with check (private.is_group_member(group_id) or private.owns_group(group_id));
create policy group_members_update on public.group_members for update to authenticated
  using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));
create policy group_members_delete on public.group_members for delete to authenticated
  using (private.is_group_member(group_id));

-- expenses
create policy expenses_select on public.expenses for select to authenticated
  using (private.is_group_member(group_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (private.is_group_member(group_id));
create policy expenses_update on public.expenses for update to authenticated
  using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));
create policy expenses_delete on public.expenses for delete to authenticated
  using (private.is_group_member(group_id));

-- expense_items follow their expense
create policy expense_items_select on public.expense_items for select to authenticated
  using (exists (select 1 from public.expenses e
                 where e.id = expense_id and private.is_group_member(e.group_id)));
create policy expense_items_insert on public.expense_items for insert to authenticated
  with check (exists (select 1 from public.expenses e
                      where e.id = expense_id and private.is_group_member(e.group_id)));
create policy expense_items_update on public.expense_items for update to authenticated
  using (exists (select 1 from public.expenses e
                 where e.id = expense_id and private.is_group_member(e.group_id)))
  with check (exists (select 1 from public.expenses e
                      where e.id = expense_id and private.is_group_member(e.group_id)));
create policy expense_items_delete on public.expense_items for delete to authenticated
  using (exists (select 1 from public.expenses e
                 where e.id = expense_id and private.is_group_member(e.group_id)));

-- settlements
create policy settlements_select on public.settlements for select to authenticated
  using (private.is_group_member(group_id));
create policy settlements_insert on public.settlements for insert to authenticated
  with check (private.is_group_member(group_id));
create policy settlements_delete on public.settlements for delete to authenticated
  using (private.is_group_member(group_id));

-- ── receipts bucket ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Files are stored under <group_id>/<expense_id>.jpg, so the first path
-- segment carries the authorisation.
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and private.is_group_member(((storage.foldername(name))[1])::uuid));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
              and private.is_group_member(((storage.foldername(name))[1])::uuid));
-- Upsert needs update as well as insert and select, or replacing a photo
-- fails silently.
create policy receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts'
         and private.is_group_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'receipts'
              and private.is_group_member(((storage.foldername(name))[1])::uuid));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts'
         and private.is_group_member(((storage.foldername(name))[1])::uuid));

-- ── Data API grants ──────────────────────────────────────────────────────
-- RLS decides which *rows* a caller sees; these grants decide whether the
-- table is reachable through PostgREST at all. Without them every request
-- returns 403 no matter how permissive the policies are.
--
-- `anon` is deliberately granted nothing: there is no public read surface in
-- Tabby, and every policy above already requires an authenticated user.

grant usage on schema public to authenticated;

grant select, update            on public.profiles      to authenticated;
grant select, insert, update, delete on public.groups        to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.expenses      to authenticated;
grant select, insert, update, delete on public.expense_items to authenticated;
grant select, insert, delete         on public.settlements   to authenticated;
