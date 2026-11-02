-- People who share a group can see each other's profile (name), nothing more.
-- Needed to show "who joined" and, later, the members list (HU-04).

create function public.shares_group(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.members a
    join public.members b on b.group_id = a.group_id
    where a.user_id = p_a and b.user_id = p_b
      and a.deleted_at is null and b.deleted_at is null
  );
$$;

-- Policies on the same command are OR-ed with profiles_select_own.
create policy profiles_select_comembers on public.profiles
  for select using (public.shares_group(public.current_user_id(), id));
