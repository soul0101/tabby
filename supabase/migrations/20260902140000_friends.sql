-- ── Friends ──────────────────────────────────────────────────────────────
--
-- The missing idea. Until now a group was built by typing names, and email was
-- a separate bolt-on next to it — so if you had somebody's address you still
-- typed their name into a box, and they still had to be invited from scratch
-- for every group. That is backwards.
--
-- A friend is somebody you have already shared a ledger with. Once that is
-- true, adding them to the next group is one tap and they are simply in it —
-- no invitation, nothing to accept. An address you have never split with still
-- gets an invitation, because being added to someone's books should be a
-- decision the first time.
--
-- Friendship is recorded as two rows, one each way, so "who are my friends" is
-- a plain indexed lookup rather than an OR across two columns.

create table public.friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  -- Their name as you know it, so a friend list reads like people and not uuids.
  display_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friends_not_self check (user_id <> friend_id)
);

create index friends_user_idx on public.friends (user_id);

alter table public.friends enable row level security;

create policy friends_select on public.friends for select to authenticated
  using (user_id = (select auth.uid()));
-- Writes go through remember_friends, which records both directions at once.
grant select on public.friends to authenticated;

/**
 * Record that two people now share a ledger, in both directions.
 *
 * SECURITY DEFINER because it writes the other person's row too — you cannot
 * add yourself to somebody else's friend list from the client, and shouldn't
 * be able to.
 */
create or replace function private.remember_friends(a uuid, b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a_name text; a_email text; b_name text; b_email text;
begin
  if a is null or b is null or a = b then return; end if;

  select p.display_name, u.email into a_name, a_email
    from public.profiles p join auth.users u on u.id = p.id where p.id = a;
  select p.display_name, u.email into b_name, b_email
    from public.profiles p join auth.users u on u.id = p.id where p.id = b;

  -- Anonymous guests have no address and shouldn't accumulate friends; the
  -- seat they hold disappears with the session.
  if a_email is null or b_email is null then return; end if;

  insert into public.friends (user_id, friend_id, display_name, email)
  values (a, b, coalesce(b_name, split_part(b_email, '@', 1)), b_email)
  on conflict (user_id, friend_id) do update
    set display_name = excluded.display_name, email = excluded.email;

  insert into public.friends (user_id, friend_id, display_name, email)
  values (b, a, coalesce(a_name, split_part(a_email, '@', 1)), a_email)
  on conflict (user_id, friend_id) do update
    set display_name = excluded.display_name, email = excluded.email;
end;
$$;

/** Everyone in a group becomes friends with everyone else who has an account. */
create or replace function private.remember_group_friends(gid uuid, joiner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare other uuid;
begin
  for other in
    select gm.user_id from public.group_members gm
    where gm.group_id = gid and gm.user_id is not null and gm.user_id <> joiner
  loop
    perform private.remember_friends(joiner, other);
  end loop;
end;
$$;

/**
 * Put a friend straight into a group.
 *
 * No invitation: you have split money with this person before, which is a
 * higher bar than an email address anyone could type. Returns the seat.
 */
create or replace function public.add_friend_to_group(p_group uuid, p_friend uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_member uuid; v_name text; v_email text;
begin
  if not private.is_group_member(p_group) then
    raise exception 'You are not in that group.';
  end if;
  if not exists (
    select 1 from public.friends f
    where f.user_id = (select auth.uid()) and f.friend_id = p_friend
  ) then
    raise exception 'You have not split anything with that person yet — invite them by email.';
  end if;

  select gm.id into v_member from public.group_members gm
   where gm.group_id = p_group and gm.user_id = p_friend;
  if v_member is not null then return v_member; end if;

  select f.display_name, f.email into v_name, v_email
    from public.friends f
   where f.user_id = (select auth.uid()) and f.friend_id = p_friend;

  insert into public.group_members (group_id, display_name, user_id, hue)
  values (p_group, coalesce(nullif(v_name, ''), split_part(v_email, '@', 1), 'Friend'),
          p_friend, (abs(hashtext(coalesce(v_email, p_friend::text))) % 360)::smallint)
  returning id into v_member;

  perform private.remember_group_friends(p_group, p_friend);
  return v_member;
end;
$$;

revoke all on function public.add_friend_to_group(uuid, uuid) from public, anon;
grant execute on function public.add_friend_to_group(uuid, uuid) to authenticated;

-- Accepting an invitation, or claiming a seat from a link, makes you friends
-- with everyone already in the group — so the next group is one tap.
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
    update public.invites set status = 'declined', responded_at = now() where id = p_invite;
    return null;
  end if;

  select gm.id into v_member from public.group_members gm
   where gm.group_id = v_invite.group_id and gm.user_id = (select auth.uid());

  if v_member is null then
    if v_invite.member_id is not null then
      update public.group_members set user_id = (select auth.uid())
       where id = v_invite.member_id and user_id is null
      returning id into v_member;
    end if;

    if v_member is null then
      select coalesce(p.display_name, split_part(v_invite.email, '@', 1)) into v_name
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

  perform private.remember_group_friends(v_invite.group_id, (select auth.uid()));
  return v_member;
end;
$$;

revoke all on function public.respond_to_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_invite(uuid, boolean) to authenticated;
