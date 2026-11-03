-- Approaches (planteamientos, HU-08): what a session will work on and who brings each part.
-- They are collaborative while the session is "planned": any member of the group can add,
-- edit, remove and reorder them.

create table public.approaches (
  id          uuid primary key,
  session_id  uuid not null references public.sessions (id),
  position    integer not null check (position >= 1),
  text        text not null check (char_length(btrim(text)) between 1 and 500),
  owner_id    uuid not null references public.profiles (id),
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index approaches_session_idx on public.approaches (session_id, position) where deleted_at is null;
create index approaches_owner_idx on public.approaches (owner_id) where deleted_at is null;

-- Which group does a session belong to, and is it still being planned? security definer so the
-- policies below do not depend on the caller being able to read sessions.
create function public.session_group_id(p_session uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select group_id from public.sessions where id = p_session and deleted_at is null;
$$;

create function public.session_is_planned(p_session uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select status = 'planned' from public.sessions where id = p_session and deleted_at is null), false);
$$;

alter table public.approaches enable row level security;

create policy approaches_select on public.approaches
  for select using (
    deleted_at is null and public.is_member(public.current_user_id(), public.session_group_id(session_id))
  );

-- The owner ("who brings it") must belong to the group; the session must still be planned.
create policy approaches_insert on public.approaches
  for insert with check (
    public.is_member(public.current_user_id(), public.session_group_id(session_id))
    and created_by = public.current_user_id()
    and public.is_member(owner_id, public.session_group_id(session_id))
    and public.session_is_planned(session_id)
  );

create policy approaches_update on public.approaches
  for update using (
    public.is_member(public.current_user_id(), public.session_group_id(session_id))
    and public.session_is_planned(session_id)
  )
  with check (
    public.is_member(public.current_user_id(), public.session_group_id(session_id))
    and public.is_member(owner_id, public.session_group_id(session_id))
  );

-- Directly, only text, owner and removal (soft delete) can change. Position moves through
-- reorder_approaches(), which keeps the whole list consistent.
revoke update on public.approaches from authenticated;
grant update (text, owner_id, deleted_at) on public.approaches to authenticated;

-- Sets the order of a session's approaches in one step. The list must contain exactly the
-- current (not removed) approaches of the session, each once.
-- Errors: P0005 reorder_invalid; 42501-style refusal as P0004 when not allowed.
create function public.reorder_approaches(p_session uuid, p_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := public.current_user_id();
  v_group uuid;
  v_current uuid[];
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Row lock on the session: two people reordering at once are serialized.
  perform 1 from public.sessions where id = p_session and deleted_at is null for update;
  v_group := public.session_group_id(p_session);
  if v_group is null or not public.is_member(v_user, v_group) or not public.session_is_planned(p_session) then
    raise exception 'reorder_not_allowed' using errcode = 'P0004';
  end if;

  select coalesce(array_agg(id order by id), '{}') into v_current
  from public.approaches where session_id = p_session and deleted_at is null;

  if (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) as x) is distinct from v_current then
    raise exception 'reorder_invalid' using errcode = 'P0005';
  end if;

  update public.approaches a
  set position = o.ord
  from unnest(p_ids) with ordinality as o(id, ord)
  where a.id = o.id and a.session_id = p_session;
end;
$$;

revoke all on function public.reorder_approaches(uuid, uuid[]) from public;
grant execute on function public.reorder_approaches(uuid, uuid[]) to authenticated;
