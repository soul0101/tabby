-- ── Real membership, and nothing is ever really gone ─────────────────────
--
-- Two changes that make the app usable by more than one person:
--
--   1. Invites addressed to an email. A seat can now be *offered* to someone,
--      and they accept or decline it. The share link still works — this is the
--      version you can send to a person who isn't standing next to you.
--
--   2. Soft delete on groups and expenses. Money is the kind of thing people
--      delete by accident, so a delete marks the row and undo clears the mark.
--      Rows keep their identity, so a restored expense keeps its thread,
--      its items and its history rather than coming back as a stranger.

-- ── soft delete ──────────────────────────────────────────────────────────
alter table public.groups   add column if not exists deleted_at timestamptz;
alter table public.expenses add column if not exists deleted_at timestamptz;

create index if not exists groups_live_idx   on public.groups (id)          where deleted_at is null;
create index if not exists expenses_live_idx on public.expenses (group_id)  where deleted_at is null;

-- Membership shouldn't survive its group. A deleted group stops granting
-- access to everything that hangs off it.
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
    join public.groups g on g.id = gm.group_id
    where gm.group_id = gid
      and gm.user_id = (select auth.uid())
      and g.deleted_at is null
  );
$$;

-- Restoring is the one thing a deleted group must still permit, or a delete is
-- final in practice: is_group_member says no once deleted_at is set, which
-- would take the undo away with the group. So the groups UPDATE policy asks a
-- looser question — were you ever a member — while every other table keeps the
-- strict predicate and stays dark.
create or replace function private.was_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = gid and gm.user_id = (select auth.uid())
  );
$$;

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (private.was_group_member(id)) with check (private.was_group_member(id));

-- ── invites ──────────────────────────────────────────────────────────────
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'revoked');

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  -- The seat being offered. Null means "make them a new seat on accept".
  member_id uuid references public.group_members(id) on delete cascade,
  email text not null check (position('@' in email) > 1 and length(email) <= 320),
  invited_by uuid references public.group_members(id) on delete set null,
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

-- One live invite per address per group; declining frees the address to be
-- asked again, which is what you want after "sorry, wrong email".
create unique index invites_one_pending_idx
  on public.invites (group_id, lower(email)) where status = 'pending';
create index invites_email_idx on public.invites (lower(email)) where status = 'pending';
create index invites_group_idx on public.invites (group_id);

alter table public.invites enable row level security;

-- The invitee is identified by the email on their JWT, so an invite is
-- visible to the group and to exactly the person it was addressed to.
create or replace function private.invite_is_mine(addr text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select lower(addr) = lower(coalesce((select auth.jwt() ->> 'email'), ''));
$$;

create policy invites_select on public.invites for select to authenticated
  using (private.is_group_member(group_id) or private.invite_is_mine(email));
create policy invites_insert on public.invites for insert to authenticated
  with check (private.is_group_member(group_id));
-- The group can revoke; the invitee answers through respond_to_invite, which
-- is SECURITY DEFINER, so no update policy is needed for them.
create policy invites_update on public.invites for update to authenticated
  using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));

grant select, insert, update on public.invites to authenticated;

-- ── accepting ────────────────────────────────────────────────────────────
-- Claiming a seat has to happen in one place: it needs to check the caller
-- owns the address, and it writes to group_members, which the caller has no
-- rights on until the moment they're a member.
create or replace function public.respond_to_invite(p_invite uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
  v_member uuid;
  v_name text;
begin
  select * into v_invite from public.invites where id = p_invite;
  if v_invite.id is null then
    raise exception 'That invitation no longer exists.';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'That invitation was already %.', v_invite.status;
  end if;
  if not private.invite_is_mine(v_invite.email) then
    raise exception 'That invitation was sent to someone else.';
  end if;

  if not p_accept then
    update public.invites
       set status = 'declined', responded_at = now()
     where id = p_invite;
    return null;
  end if;

  -- Already in the group (two invites, or joined by link in the meantime).
  select gm.id into v_member
    from public.group_members gm
   where gm.group_id = v_invite.group_id
     and gm.user_id = (select auth.uid());

  if v_member is null then
    if v_invite.member_id is not null then
      -- Take the seat we were offered, unless someone else already has it.
      update public.group_members
         set user_id = (select auth.uid())
       where id = v_invite.member_id and user_id is null
      returning id into v_member;
    end if;

    if v_member is null then
      select coalesce(p.display_name, split_part(v_invite.email, '@', 1))
        into v_name
        from public.profiles p where p.id = (select auth.uid());
      insert into public.group_members (group_id, display_name, user_id, hue)
      values (v_invite.group_id, coalesce(v_name, 'Someone'), (select auth.uid()),
              (abs(hashtext(v_invite.email)) % 360)::smallint)
      returning id into v_member;
    end if;
  end if;

  update public.invites
     set status = 'accepted', responded_at = now(), member_id = v_member
   where id = p_invite;

  return v_member;
end;
$$;

revoke all on function public.respond_to_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_invite(uuid, boolean) to authenticated;

-- What am I holding? Answers before the user is a member of anything, so it
-- can't be a plain select against invites joined to groups.
create or replace function public.my_invites()
returns table (
  id uuid, group_id uuid, group_name text, invited_by_name text,
  member_name text, created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select i.id, i.group_id, g.name,
         inviter.display_name, seat.display_name, i.created_at
    from public.invites i
    join public.groups g on g.id = i.group_id
    left join public.group_members inviter on inviter.id = i.invited_by
    left join public.group_members seat on seat.id = i.member_id
   where i.status = 'pending'
     and g.deleted_at is null
     and private.invite_is_mine(i.email)
   order by i.created_at desc;
$$;

revoke all on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;
