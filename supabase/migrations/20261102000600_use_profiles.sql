-- Point the domain at public.profiles and public.current_user_id() instead of Supabase's
-- auth.users / auth.uid(). Portable: nothing here mentions Supabase Auth.
-- (Tables are empty at this point, so repointing the foreign keys is safe.)

alter table public.members drop constraint members_user_id_fkey;
alter table public.members
  add constraint members_user_id_fkey foreign key (user_id) references public.profiles (id);

alter table public.invites drop constraint invites_created_by_fkey;
alter table public.invites
  add constraint invites_created_by_fkey foreign key (created_by) references public.profiles (id);

alter table public.invites drop constraint invites_accepted_by_fkey;
alter table public.invites
  add constraint invites_accepted_by_fkey foreign key (accepted_by) references public.profiles (id);

-- Policies ----------------------------------------------------------------------------
drop policy groups_select  on public.groups;
drop policy groups_update  on public.groups;
drop policy members_select on public.members;
drop policy invites_select on public.invites;
drop policy invites_insert on public.invites;
drop policy invites_update on public.invites;

create policy groups_select on public.groups
  for select using (deleted_at is null and public.is_member(public.current_user_id(), id));

create policy groups_update on public.groups
  for update using (public.is_admin(public.current_user_id(), id))
  with check (public.is_admin(public.current_user_id(), id));

create policy members_select on public.members
  for select using (public.is_member(public.current_user_id(), group_id));

create policy invites_select on public.invites
  for select using (public.is_admin(public.current_user_id(), group_id));

create policy invites_insert on public.invites
  for insert with check (
    public.is_admin(public.current_user_id(), group_id) and created_by = public.current_user_id()
  );

create policy invites_update on public.invites
  for update using (public.is_admin(public.current_user_id(), group_id))
  with check (public.is_admin(public.current_user_id(), group_id));

-- Functions ---------------------------------------------------------------------------
create or replace function public.create_group(
  p_id uuid, p_handle text, p_name text, p_city text default null
)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := public.current_user_id();
  v_group public.groups;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.groups (id, handle, name, city)
  values (p_id, p_handle, btrim(p_name), nullif(btrim(p_city), ''))
  returning * into v_group;

  insert into public.members (group_id, user_id, role)
  values (p_id, v_user, 'admin');

  return v_group;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := public.current_user_id();
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
