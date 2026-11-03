-- Soft-deleting an approach cannot be a plain UPDATE under RLS: the row would stop matching the
-- SELECT policy (deleted_at is null), and Postgres rejects an UPDATE whose new row is not
-- visible ("new row violates row-level security policy"). So removal goes through this function,
-- and deleted_at is no longer writable directly. Same rule for any future soft delete.

revoke update on public.approaches from authenticated;
grant update (text, owner_id) on public.approaches to authenticated;

-- Removes an approach of a planned session; any member of the group may. Errors: P0004.
create function public.remove_approach(p_approach uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := public.current_user_id();
  v_session uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select session_id into v_session from public.approaches where id = p_approach and deleted_at is null;
  if v_session is null
     or not public.is_member(v_user, public.session_group_id(v_session))
     or not public.session_is_planned(v_session) then
    raise exception 'remove_not_allowed' using errcode = 'P0004';
  end if;

  update public.approaches set deleted_at = now() where id = p_approach;
end;
$$;

revoke all on function public.remove_approach(uuid) from public;
grant execute on function public.remove_approach(uuid) to authenticated;
