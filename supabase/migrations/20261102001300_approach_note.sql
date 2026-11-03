-- The note "cómo lo planteo" on an approach: the person it is assigned to writes how they will
-- bring it. Everyone in the group reads it (the approaches SELECT policy already covers the
-- column); only the current owner writes it, so it goes through a function and the column is
-- not writable directly (UPDATE stays granted only for text and owner_id; see decisions/0006).

alter table public.approaches
  add column note text check (note is null or char_length(note) <= 2000);

-- Sets or clears (null) the note. Only the owner of the approach, while the session is planned.
-- Errors: P0004 not allowed.
create function public.set_approach_note(p_approach uuid, p_note text)
returns public.approaches
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := public.current_user_id();
  v_approach public.approaches;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_approach from public.approaches where id = p_approach and deleted_at is null for update;
  if not found
     or v_approach.owner_id <> v_user
     or not public.is_member(v_user, public.session_group_id(v_approach.session_id))
     or not public.session_is_planned(v_approach.session_id) then
    raise exception 'note_not_allowed' using errcode = 'P0004';
  end if;

  update public.approaches set note = nullif(btrim(p_note), '') where id = p_approach returning * into v_approach;
  return v_approach;
end;
$$;

revoke all on function public.set_approach_note(uuid, text) from public;
grant execute on function public.set_approach_note(uuid, text) to authenticated;
