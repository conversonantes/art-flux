-- Groups and members (HU-02). Names in English; see the glossary in CLAUDE.md.
-- Rule: RLS answers "who can see/write this row"; the core decides "who can do what now".

create table public.groups (
  id          uuid primary key,
  handle      text not null,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  city        text check (city is null or char_length(city) <= 80),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint groups_handle_format check (
    handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(handle) between 3 and 30
  )
);

-- Unique @handle among live groups; names may repeat.
create unique index groups_handle_key on public.groups (handle) where deleted_at is null;

create table public.members (
  group_id    uuid not null references public.groups (id),
  user_id     uuid not null references auth.users (id),
  role        text not null default 'member' check (role in ('admin', 'member')),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (group_id, user_id)
);

create index members_user_idx on public.members (user_id) where deleted_at is null;

-- Helpers. security definer so policies on `members` do not recurse into themselves.
create function public.is_member(p_user uuid, p_group uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members
    where user_id = p_user and group_id = p_group and deleted_at is null
  );
$$;

create function public.is_admin(p_user uuid, p_group uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members
    where user_id = p_user and group_id = p_group and role = 'admin' and deleted_at is null
  );
$$;

alter table public.groups  enable row level security;
alter table public.members enable row level security;

-- Read: members see their groups and the members of those groups.
create policy groups_select on public.groups
  for select using (deleted_at is null and public.is_member(auth.uid(), id));

create policy members_select on public.members
  for select using (public.is_member(auth.uid(), group_id));

-- Writes to groups/members go through create_group() (atomic) or, later, admin use cases.
-- No insert policies on purpose: nobody can add themselves to a group directly.
create policy groups_update on public.groups
  for update using (public.is_admin(auth.uid(), id))
  with check (public.is_admin(auth.uid(), id));

-- Creates a group and its first admin in one transaction (mirrors GroupsRepo.create).
-- Raises unique_violation if the handle is taken, so the core can retry with the next one.
create function public.create_group(
  p_id uuid, p_handle text, p_name text, p_city text default null
)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
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

revoke all on function public.create_group(uuid, text, text, text) from public;
grant execute on function public.create_group(uuid, text, text, text) to authenticated;
