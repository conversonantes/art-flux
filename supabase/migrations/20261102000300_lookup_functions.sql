-- Lookups that RLS would otherwise hide from the caller.

-- Is this @handle taken? Reveals only a boolean, never the group.
create function public.handle_exists(p_handle text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.groups where handle = p_handle and deleted_at is null);
$$;

-- The person opening an invite link is not a member yet. Holding the token is what
-- authorizes reading that one invitation (unguessable, 256 bits).
create function public.find_invite_by_token(p_token text)
returns setof public.invites
language sql stable security definer set search_path = public
as $$
  select * from public.invites where token = p_token;
$$;

revoke all on function public.handle_exists(text) from public;
revoke all on function public.find_invite_by_token(text) from public;
grant execute on function public.handle_exists(text) to authenticated;
grant execute on function public.find_invite_by_token(text) to authenticated;
