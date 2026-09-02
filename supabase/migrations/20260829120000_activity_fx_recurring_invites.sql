-- Activity log, multi-currency, recurring templates, and invite links.

-- ── multi-currency ───────────────────────────────────────────────────────
-- An expense can be in a different currency from the group. The rate used is
-- stored on the row, so a later swing in the market never rewrites history.
alter table public.expenses
  add column if not exists fx_rate numeric(18, 8) not null default 1,
  add column if not exists base_total_minor bigint;

comment on column public.expenses.fx_rate is
  'Units of the group currency per unit of the expense currency, at entry time.';
comment on column public.expenses.base_total_minor is
  'total_minor converted into the group currency. Authoritative for balances.';

update public.expenses set base_total_minor = total_minor where base_total_minor is null;
alter table public.expenses alter column base_total_minor set default 0;

-- ── activity log ─────────────────────────────────────────────────────────
create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  actor_member uuid references public.group_members(id) on delete set null,
  actor_user uuid references auth.users(id) on delete set null,
  kind text not null check (kind in (
    'group_created', 'member_added', 'member_removed',
    'expense_added', 'expense_edited', 'expense_deleted',
    'settlement_added', 'settlement_undone'
  )),
  summary text not null,
  amount_minor bigint,
  created_at timestamptz not null default now()
);

create index if not exists activity_group_created_idx
  on public.activity (group_id, created_at desc);

alter table public.activity enable row level security;

create policy activity_select on public.activity for select to authenticated
  using (private.is_group_member(group_id));
create policy activity_insert on public.activity for insert to authenticated
  with check (private.is_group_member(group_id));

grant select, insert on public.activity to authenticated;

-- ── recurring templates ──────────────────────────────────────────────────
create table if not exists public.recurring (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 140),
  category text not null default 'other',
  payer_id uuid not null references public.group_members(id) on delete cascade,
  total_minor bigint not null check (total_minor > 0),
  currency text not null default 'INR',
  participants uuid[] not null default '{}',
  split_mode public.split_mode not null default 'equal',
  weights jsonb not null default '{}'::jsonb,
  cadence text not null default 'monthly' check (cadence in ('weekly', 'monthly')),
  /** The next date an instance is due. Rolled forward as they're added. */
  next_due date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists recurring_group_idx on public.recurring (group_id) where active;

alter table public.recurring enable row level security;

create policy recurring_select on public.recurring for select to authenticated
  using (private.is_group_member(group_id));
create policy recurring_insert on public.recurring for insert to authenticated
  with check (private.is_group_member(group_id));
create policy recurring_update on public.recurring for update to authenticated
  using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));
create policy recurring_delete on public.recurring for delete to authenticated
  using (private.is_group_member(group_id));

grant select, insert, update, delete on public.recurring to authenticated;

-- ── invite links ─────────────────────────────────────────────────────────
alter table public.groups
  add column if not exists invite_token uuid not null default gen_random_uuid();

create unique index if not exists groups_invite_token_idx on public.groups (invite_token);

/*
 * Joining is the one flow where the caller is deliberately *not* yet a member,
 * so RLS can't be the gate. These two functions are the gate instead: they run
 * as definer, take the token as the only capability, and check auth.uid()
 * themselves. They live in `public` because they must be callable over RPC,
 * so execute is revoked from PUBLIC and granted only to authenticated.
 */
create or replace function public.peek_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  g record;
  seats jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to open an invite.';
  end if;

  select id, name, emoji, currency into g from public.groups where invite_token = p_token;
  if g.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if exists (select 1 from public.group_members m
             where m.group_id = g.id and m.user_id = (select auth.uid())) then
    return jsonb_build_object('ok', true, 'alreadyMember', true, 'groupId', g.id, 'name', g.name, 'emoji', g.emoji);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name) order by m.created_at), '[]'::jsonb)
    into seats
  from public.group_members m
  where m.group_id = g.id and m.user_id is null;

  return jsonb_build_object(
    'ok', true, 'alreadyMember', false, 'groupId', g.id,
    'name', g.name, 'emoji', g.emoji, 'seats', seats
  );
end;
$$;

/*
 * Claim an unclaimed seat, or create a new one. Returns the group id.
 * p_member_id is optional: null means "I'm not in the list, add me".
 */
create or replace function public.join_group(p_token uuid, p_member_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_user uuid := (select auth.uid());
  v_name text;
  v_count int;
begin
  if v_user is null then
    raise exception 'Sign in to join a group.';
  end if;

  select id into v_group from public.groups where invite_token = p_token;
  if v_group is null then
    raise exception 'That invite link is not valid.';
  end if;

  -- Already in? Nothing to do.
  if exists (select 1 from public.group_members m
             where m.group_id = v_group and m.user_id = v_user) then
    return v_group;
  end if;

  select display_name into v_name from public.profiles where id = v_user;
  v_name := coalesce(nullif(trim(v_name), ''), 'Someone');

  if p_member_id is not null then
    -- Claim the seat, but keep the name the group already knows you by. The
    -- inviter typed "Meera"; overwriting that with a placeholder profile name
    -- would erase her from everyone else's view.
    update public.group_members
      set user_id = v_user
      where id = p_member_id and group_id = v_group and user_id is null
      returning display_name into v_name;
    if v_name is null then
      raise exception 'That seat has already been taken.';
    end if;

    -- If this person has no real name yet, adopt the one they were added as.
    update public.profiles
      set display_name = v_name
      where id = v_user and (display_name is null or trim(display_name) in ('', 'You'));
  else
    select count(*) into v_count from public.group_members where group_id = v_group;
    insert into public.group_members (group_id, display_name, hue, user_id)
    values (v_group, v_name, (array[25, 250, 145, 300, 60, 335, 195, 100])[(v_count % 8) + 1], v_user);
  end if;

  insert into public.activity (group_id, actor_user, kind, summary)
  values (v_group, v_user, 'member_added', v_name || ' joined the group');

  return v_group;
end;
$$;

revoke all on function public.peek_invite(uuid) from public;
revoke all on function public.join_group(uuid, uuid) from public;
grant execute on function public.peek_invite(uuid) to authenticated;
grant execute on function public.join_group(uuid, uuid) to authenticated;
