-- Invite links (HU-03). One active link per group; revoking keeps the row.

create table public.invites (
  id          uuid primary key,
  group_id    uuid not null references public.groups (id),
  token       text not null unique check (char_length(token) >= 32),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

-- At most one active (not revoked) link per group.
create unique index invites_one_active_per_group on public.invites (group_id) where revoked_at is null;

alter table public.invites enable row level security;

-- Only admins of the group can see, create and revoke its links.
create policy invites_select on public.invites
  for select using (public.is_admin(auth.uid(), group_id));

create policy invites_insert on public.invites
  for insert with check (public.is_admin(auth.uid(), group_id) and created_by = auth.uid());

create policy invites_update on public.invites
  for update using (public.is_admin(auth.uid(), group_id))
  with check (public.is_admin(auth.uid(), group_id));

-- The person opening the link is not a member yet, so RLS would hide everything from them.
-- This function is the only way in: it checks the token and adds the caller as a member.
-- Idempotent: an existing member (even an admin) keeps their role.
create function public.accept_invite(p_token text)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.invites;
  v_group public.groups;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.invites
  where token = p_token and revoked_at is null;
  if not found then
    raise exception 'invite_invalid' using errcode = 'P0002';
  end if;

  select * into v_group from public.groups
  where id = v_invite.group_id and deleted_at is null;
  if not found then
    raise exception 'invite_invalid' using errcode = 'P0002';
  end if;

  insert into public.members (group_id, user_id, role)
  values (v_group.id, v_user, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_group;
end;
$$;

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;
