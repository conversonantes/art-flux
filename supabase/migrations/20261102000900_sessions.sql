-- Sessions (HU-07) and the project origin session (HU-05).
-- A session belongs to a group and, optionally, to a project (obra). Numbers are assigned by
-- the core (max + 1 inside the scope) and protected here by partial unique indexes.

create table public.sessions (
  id            uuid primary key,
  group_id      uuid not null references public.groups (id),
  project_id    uuid references public.projects (id),
  number        integer not null check (number >= 1),
  session_date  date,
  place         text check (place is null or char_length(place) <= 120),
  objective     text check (objective is null or char_length(objective) <= 1000),
  status        text not null default 'planned' check (status in ('planned', 'completed')),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Numbering scope: inside the project when it has one, inside the group otherwise.
create unique index sessions_project_number_key
  on public.sessions (project_id, number) where project_id is not null and deleted_at is null;
create unique index sessions_group_number_key
  on public.sessions (group_id, number) where project_id is null and deleted_at is null;
create index sessions_group_idx on public.sessions (group_id) where deleted_at is null;

-- The session a project was born from (HU-05). Set only by attach_origin_session().
alter table public.projects add column origin_session_id uuid references public.sessions (id);

-- "S01", "S02"... are reserved for sessions in URLs (/group/S02), so a project cannot use them.
alter table public.projects
  add constraint projects_slug_not_session check (slug !~ '^s[0-9]+$');

alter table public.sessions enable row level security;

create policy sessions_select on public.sessions
  for select using (deleted_at is null and public.is_member(public.current_user_id(), group_id));

-- Any member plans sessions (HU-07). A project must belong to the same group.
create policy sessions_insert on public.sessions
  for insert with check (
    public.is_member(public.current_user_id(), group_id)
    and created_by = public.current_user_id()
    and status = 'planned'
    and (project_id is null or public.project_group_id(project_id) = group_id)
  );

-- The admin or whoever created the session can edit it.
create policy sessions_update on public.sessions
  for update using (
    public.is_admin(public.current_user_id(), group_id) or created_by = public.current_user_id()
  )
  with check (
    public.is_admin(public.current_user_id(), group_id) or created_by = public.current_user_id()
  );

-- Even an editor may only change these columns directly. Moving a session to a project
-- (number, project_id) goes through attach_origin_session(); completing it comes later.
revoke update on public.sessions from authenticated;
grant update (session_date, place, objective) on public.sessions to authenticated;

-- Makes a group session the origin of a project: the session joins the project with the
-- number the core computed, and the project remembers it. Atomic. The core already checked
-- everything; this re-checks it because the database is the security boundary.
-- Errors: P0004 origin_invalid (not allowed or not applicable); 23505 if the number is taken.
create function public.attach_origin_session(p_project uuid, p_session uuid, p_number integer)
returns public.sessions
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := public.current_user_id();
  v_project public.projects;
  v_session public.sessions;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_project from public.projects
  where id = p_project and deleted_at is null for update;
  if not found or not public.is_admin(v_user, v_project.group_id) then
    raise exception 'origin_invalid' using errcode = 'P0004';
  end if;
  if v_project.origin_session_id is not null then
    raise exception 'origin_invalid' using errcode = 'P0004';
  end if;

  select * into v_session from public.sessions
  where id = p_session and deleted_at is null for update;
  if not found or v_session.group_id <> v_project.group_id or v_session.project_id is not null then
    raise exception 'origin_invalid' using errcode = 'P0004';
  end if;

  update public.sessions set project_id = p_project, number = p_number
  where id = p_session returning * into v_session;

  update public.projects set origin_session_id = p_session where id = p_project;
  return v_session;
end;
$$;

revoke all on function public.attach_origin_session(uuid, uuid, integer) from public;
grant execute on function public.attach_origin_session(uuid, uuid, integer) to authenticated;
