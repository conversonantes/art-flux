-- Invitations become single-use links without an email (HU-03, revised).
-- One link per person; it is spent on first use and expires 7 days after creation
-- (expires_at is computed by the core). invites is empty here, so NOT NULL is safe.

drop index public.invites_one_active_per_group_email;

alter table public.invites
  drop column email,
  add column expires_at  timestamptz not null default (now() + interval '7 days'),
  add column accepted_by uuid references auth.users (id),
  add column accepted_at timestamptz,
  add column label       text check (label is null or char_length(label) <= 80);

alter table public.invites alter column expires_at drop default;

-- Spends the link atomically. Errors: P0002 invite_invalid (unknown, revoked, expired or
-- already used by someone else). A member who opens it does not spend it; the person who
-- spent it can open it again (reload) and gets the group back.
create or replace function public.accept_invite(p_token text)
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

  -- Row lock: two people opening the same link at once are serialized.
  select * into v_invite from public.invites where token = p_token for update;
  if not found or v_invite.revoked_at is not null then
    raise exception 'invite_invalid' using errcode = 'P0002';
  end if;

  select * into v_group from public.groups
  where id = v_invite.group_id and deleted_at is null;
  if not found then
    raise exception 'invite_invalid' using errcode = 'P0002';
  end if;

  -- Already a member (admin testing their own link, or a reload): do not spend the link.
  if public.is_member(v_user, v_group.id) then
    return v_group;
  end if;

  if v_invite.accepted_at is not null or v_invite.expires_at <= now() then
    raise exception 'invite_invalid' using errcode = 'P0002';
  end if;

  update public.invites set accepted_by = v_user, accepted_at = now() where id = v_invite.id;

  insert into public.members (group_id, user_id, role)
  values (v_group.id, v_user, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_group;
end;
$$;
