-- Invitations are tied to an email: only that verified email can accept (HU-03).
-- One live invitation per (group, email) instead of one per group.
-- invites is empty at this point, so adding a NOT NULL column is safe.

alter table public.invites
  add column email text not null
  check (email = lower(btrim(email)) and position('@' in email) > 1);

drop index public.invites_one_active_per_group;
create unique index invites_one_active_per_group_email
  on public.invites (group_id, email) where revoked_at is null;

-- Same function, now checking that the caller's verified email matches the invitation.
-- Errors: P0002 invite_invalid (unknown/revoked token), P0003 invite_email_mismatch.
create or replace function public.accept_invite(p_token text)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
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

  -- Email comes from auth.users and must be confirmed; never from client input.
  select lower(btrim(email)) into v_email from auth.users
  where id = v_user and email_confirmed_at is not null;
  if v_email is null or v_email <> v_invite.email then
    raise exception 'invite_email_mismatch' using errcode = 'P0003';
  end if;

  insert into public.members (group_id, user_id, role)
  values (v_group.id, v_user, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_group;
end;
$$;
