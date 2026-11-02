-- SUPABASE AUTH BRIDGE. This is the ONLY migration that knows about Supabase Auth
-- (auth.users, auth.uid()). Everything else talks to public.profiles and
-- public.current_user_id(). To move to another identity provider, rewrite this file's
-- pieces: how current_user_id() learns who is calling, and how profiles get created.

-- Our own record of a person. Tables point here, never at auth.users, so what someone
-- registered survives if their login account is removed or the provider changes.
create table public.profiles (
  id            uuid primary key,
  display_name  text check (display_name is null or char_length(display_name) <= 120),
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- For now each person sees only their own profile; seeing fellow members arrives with HU-04.
-- No write policies: profiles are created by the trigger below.

-- Who is calling? The one place that reads Supabase's session.
create function public.current_user_id()
returns uuid
language sql stable
as $$
  select auth.uid();
$$;

create policy profiles_select_own on public.profiles
  for select using (id = public.current_user_id());

-- Every new login account gets a profile (Google's full_name when available). Idempotent.
create function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Accounts that already existed before this migration.
insert into public.profiles (id, display_name)
select id, nullif(btrim(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', '')), '')
from auth.users
on conflict (id) do nothing;
