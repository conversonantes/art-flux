-- Projects (obras) and their team (HU-05, HU-06). Portable: uses profiles and current_user_id().
-- Visibility beyond the group (HU-24) will add a column later; for now everything is group-only.

create table public.projects (
  id                    uuid primary key,
  group_id              uuid not null references public.groups (id),
  slug                  text not null,
  title                 text not null check (char_length(btrim(title)) between 1 and 120),
  status                text not null default 'searching'
                          check (status in ('searching', 'staging', 'running', 'archived')),
  themes                text[] not null default '{}' check (cardinality(themes) <= 8),
  visibility_agreement  text check (visibility_agreement is null or char_length(visibility_agreement) <= 2000),
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint projects_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40
  )
);

-- A slug is unique within its group, not globally: two groups can both have "cristina".
create unique index projects_group_slug_key on public.projects (group_id, slug) where deleted_at is null;
create index projects_group_idx on public.projects (group_id) where deleted_at is null;

-- Team members carry artistic roles. Roles are labels only; they never grant permissions.
create table public.project_team (
  project_id  uuid not null references public.projects (id),
  user_id     uuid not null references public.profiles (id),
  roles       text[] not null default '{}' check (cardinality(roles) <= 6),
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Which group does a project belong to? security definer so policies on project_team
-- do not depend on the caller being able to read projects.
create function public.project_group_id(p_project uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select group_id from public.projects where id = p_project and deleted_at is null;
$$;

alter table public.projects     enable row level security;
alter table public.project_team enable row level security;

create policy projects_select on public.projects
  for select using (deleted_at is null and public.is_member(public.current_user_id(), group_id));

create policy projects_insert on public.projects
  for insert with check (public.is_admin(public.current_user_id(), group_id));

create policy projects_update on public.projects
  for update using (public.is_admin(public.current_user_id(), group_id))
  with check (public.is_admin(public.current_user_id(), group_id));

create policy project_team_select on public.project_team
  for select using (public.is_member(public.current_user_id(), public.project_group_id(project_id)));

-- Only admins edit the team, and only with people who belong to the project's group.
create policy project_team_insert on public.project_team
  for insert with check (
    public.is_admin(public.current_user_id(), public.project_group_id(project_id))
    and public.is_member(user_id, public.project_group_id(project_id))
  );

create policy project_team_update on public.project_team
  for update using (public.is_admin(public.current_user_id(), public.project_group_id(project_id)))
  with check (
    public.is_admin(public.current_user_id(), public.project_group_id(project_id))
    and public.is_member(user_id, public.project_group_id(project_id))
  );

create policy project_team_delete on public.project_team
  for delete using (public.is_admin(public.current_user_id(), public.project_group_id(project_id)));
