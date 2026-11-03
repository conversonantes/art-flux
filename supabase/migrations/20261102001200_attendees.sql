-- Marking a session as held, and who was there (HU-11).
-- Attendees are written only by the two functions below: completing a session changes its status
-- (not writable directly) and saves the attendees in one step, so there is never a "held" session
-- half-saved. The core checks first; these functions re-check because the database is the boundary.

create table public.attendees (
  session_id uuid not null references public.sessions (id),
  user_id    uuid not null references public.profiles (id),
  primary key (session_id, user_id)
);

alter table public.attendees enable row level security;

create policy attendees_select on public.attendees
  for select using (public.is_member(public.current_user_id(), public.session_group_id(session_id)));

-- Reading only: no INSERT, UPDATE or DELETE straight from a client.
revoke all on public.attendees from authenticated;
grant select on public.attendees to authenticated;

-- Shared by both functions: every attendee must belong to the session's group.
create function public.save_attendees(p_session uuid, p_group uuid, p_attendees uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(array(select distinct unnest(p_attendees)), '{}');
  v_id uuid;
begin
  foreach v_id in array v_ids loop
    if not public.is_member(v_id, p_group) then
      raise exception 'attendee_invalid' using errcode = 'P0005';
    end if;
  end loop;

  delete from public.attendees where session_id = p_session;
  insert into public.attendees (session_id, user_id) select p_session, unnest(v_ids);
end;
$$;

revoke all on function public.save_attendees(uuid, uuid, uuid[]) from public;

-- Planned -> completed, with the attendees. Any member of the group may.
-- Errors: P0004 not allowed or not planned; P0005 an attendee is not in the group.
create function public.complete_session(p_session uuid, p_attendees uuid[])
returns public.sessions
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := public.current_user_id();
  v_session public.sessions;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_session from public.sessions where id = p_session and deleted_at is null for update;
  if not found or not public.is_member(v_user, v_session.group_id) or v_session.status <> 'planned' then
    raise exception 'complete_not_allowed' using errcode = 'P0004';
  end if;

  perform public.save_attendees(p_session, v_session.group_id, p_attendees);
  update public.sessions set status = 'completed' where id = p_session returning * into v_session;
  return v_session;
end;
$$;

revoke all on function public.complete_session(uuid, uuid[]) from public;
grant execute on function public.complete_session(uuid, uuid[]) to authenticated;

-- Corrects who was there once the session was held. Errors: P0004, P0005 as above.
create function public.set_attendees(p_session uuid, p_attendees uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := public.current_user_id();
  v_session public.sessions;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_session from public.sessions where id = p_session and deleted_at is null for update;
  if not found or not public.is_member(v_user, v_session.group_id) or v_session.status <> 'completed' then
    raise exception 'attendees_not_allowed' using errcode = 'P0004';
  end if;

  perform public.save_attendees(p_session, v_session.group_id, p_attendees);
end;
$$;

revoke all on function public.set_attendees(uuid, uuid[]) from public;
grant execute on function public.set_attendees(uuid, uuid[]) to authenticated;
