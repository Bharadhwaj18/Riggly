-- Setlist guests: someone invited to see only the setlists you pick, until a date you pick.
--
-- A setlist guest is a member whose permissions carry
--   "setlist_guest": true, "setlist_ids": ["<setlist id>", ...], "access_until": "YYYY-MM-DD" (or absent: no end)
-- They can VIEW those setlists and everything in them (songs, chord charts, lyrics, keys, notes, references),
-- and nothing else in the workspace. From the day after access_until (India time) they see nothing at all.
-- The invite link carries the same keys and join_with_invite copies them onto the new member.
-- Admins change a guest's setlists and end date in Members. Safe to re-run.

begin;

-- 'active', 'ended', or null when you're not a setlist guest here.
create or replace function public.setlist_guest_state(ws uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when m.role in ('owner', 'admin') or coalesce(m.permissions ->> 'setlist_guest', 'false') <> 'true' then null
    when (m.permissions ->> 'access_until') ~ '^\d{4}-\d{2}-\d{2}$'
         and now() >= (((m.permissions ->> 'access_until')::date + 1)::timestamp at time zone 'Asia/Kolkata') then 'ended'
    else 'active'
  end
  from public.workspace_members m
  where m.workspace_id = ws and m.user_id = auth.uid()
  limit 1
$$;

-- The setlists a guest can open: null for everyone who isn't a setlist guest, empty once their access has ended.
create or replace function public.guest_setlist_ids(ws uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select case public.setlist_guest_state(ws)
    when 'active' then coalesce(array(
      select v::uuid from jsonb_array_elements_text(
        case when jsonb_typeof(m.permissions -> 'setlist_ids') = 'array' then m.permissions -> 'setlist_ids' else '[]'::jsonb end
      ) as v
      where v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), '{}'::uuid[])
    when 'ended' then '{}'::uuid[]
    else null
  end
  from public.workspace_members m
  where m.workspace_id = ws and m.user_id = auth.uid()
  limit 1
$$;

revoke all on function public.setlist_guest_state(uuid) from public, anon;
revoke all on function public.guest_setlist_ids(uuid) from public, anon;
grant execute on function public.setlist_guest_state(uuid) to authenticated;
grant execute on function public.guest_setlist_ids(uuid) to authenticated;

-- Guests: Setlists and Songs are view only (Songs so a song's chord chart opens from the setlist), everything else hidden.
-- Once their access has ended, everything is hidden.
create or replace function public.section_level(ws uuid, sec text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when not public.workspace_feature_on(ws, sec) then 'none'
    when m.role in ('owner', 'admin') then 'edit'
    when coalesce(m.permissions ->> 'setlist_guest', 'false') = 'true' then
      case when sec in ('setlists', 'songs') and public.setlist_guest_state(ws) = 'active' then 'view' else 'none' end
    else coalesce(m.permissions -> 'sections' ->> sec, 'edit')
  end
  from public.workspace_members m
  where m.workspace_id = ws and m.user_id = auth.uid()
  limit 1
$$;

-- Rows a guest can read: only their setlists, the songs in them, and those songs' references.
drop policy if exists guest_setlists_read on public.setlists;
create policy guest_setlists_read on public.setlists as restrictive for select to authenticated
  using (public.guest_setlist_ids(workspace_id) is null or id = any (public.guest_setlist_ids(workspace_id)));

drop policy if exists guest_setlist_songs_read on public.setlist_songs;
create policy guest_setlist_songs_read on public.setlist_songs as restrictive for select to authenticated
  using (public.guest_setlist_ids(workspace_id) is null or setlist_id = any (public.guest_setlist_ids(workspace_id)));

drop policy if exists guest_songs_read on public.songs;
create policy guest_songs_read on public.songs as restrictive for select to authenticated
  using (
    public.guest_setlist_ids(workspace_id) is null
    or exists (select 1 from public.setlist_songs ss
               where ss.song_id = songs.id and ss.setlist_id = any (public.guest_setlist_ids(songs.workspace_id)))
  );

drop policy if exists guest_song_references_read on public.song_references;
create policy guest_song_references_read on public.song_references as restrictive for select to authenticated
  using (
    public.guest_setlist_ids(workspace_id) is null
    or exists (select 1 from public.setlist_songs ss
               where ss.song_id = song_references.song_id and ss.setlist_id = any (public.guest_setlist_ids(song_references.workspace_id)))
  );

-- Joining with a setlist-guest link copies the guest keys onto the new member.
create or replace function public.join_with_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
  v_sections jsonb;
  v_crew boolean;
  v_guest jsonb;
  v_was_member boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to join'; end if;

  select i.workspace_id, i.permissions -> 'sections', coalesce(i.permissions ->> 'merch_crew' = 'true', false) and i.role <> 'admin',
         case when i.role <> 'admin' and i.permissions ->> 'setlist_guest' = 'true'
              then jsonb_build_object('setlist_guest', true, 'setlist_ids', coalesce(i.permissions -> 'setlist_ids', '[]'::jsonb))
                   || case when i.permissions ? 'access_until' then jsonb_build_object('access_until', i.permissions -> 'access_until') else '{}'::jsonb end
         end
    into v_ws, v_sections, v_crew, v_guest
    from public.workspace_invites i where i.token = p_token;
  if v_ws is null then raise exception 'Invite link not found'; end if;

  v_was_member := exists (select 1 from public.workspace_members m where m.workspace_id = v_ws and m.user_id = auth.uid());

  -- All the existing checks (expired, revoked, used up, workspace unavailable) still happen here.
  v_ws := public.accept_workspace_invite(p_token);

  -- Only a NEW member gets the invite's access; someone already in the workspace keeps what they have.
  if not v_was_member then
    update public.workspace_members m
       set permissions = coalesce(m.permissions, '{}'::jsonb)
             || case when v_sections is not null and jsonb_typeof(v_sections) = 'object' then jsonb_build_object('sections', v_sections) else '{}'::jsonb end
             || case when v_crew then jsonb_build_object('merch_crew', true) else '{}'::jsonb end
             || coalesce(v_guest, '{}'::jsonb)
     where m.workspace_id = v_ws and m.user_id = auth.uid() and m.role not in ('owner', 'admin');
  end if;

  return v_ws;
end $$;

revoke all on function public.join_with_invite(text) from public, anon;
grant execute on function public.join_with_invite(text) to authenticated;

-- For the invite page: which setlists a guest link opens, and until when. Null for other links. The token is the secret.
create or replace function public.invite_setlist_guest(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when i.role <> 'admin' and i.permissions ->> 'setlist_guest' = 'true' then
    jsonb_build_object(
      'titles', coalesce((
        select jsonb_agg(s.title order by s.show_date nulls last, s.title)
        from public.setlists s
        where s.workspace_id = i.workspace_id
          and s.id::text in (select jsonb_array_elements_text(case when jsonb_typeof(i.permissions -> 'setlist_ids') = 'array' then i.permissions -> 'setlist_ids' else '[]'::jsonb end))
      ), '[]'::jsonb),
      'access_until', i.permissions -> 'access_until'
    )
  end
  from public.workspace_invites i where i.token = p_token;
$$;

revoke all on function public.invite_setlist_guest(text) from public;
grant execute on function public.invite_setlist_guest(text) to anon, authenticated;

-- The switcher's "N members" leaves out setlist guests too, like Merch crew.
create or replace function public.workspace_attention()
returns table (workspace_id uuid, member_count integer, next_show_date date, tasks_due integer)
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Asia/Kolkata')::date as d)
  select
    m.workspace_id,
    (select count(*)::int from public.workspace_members x
      where x.workspace_id = m.workspace_id
        and not (x.role not in ('owner', 'admin')
                 and (coalesce(x.permissions ->> 'merch_crew', 'false') = 'true' or coalesce(x.permissions ->> 'setlist_guest', 'false') = 'true'))),
    case when public.section_level(m.workspace_id, 'shows') <> 'none' then
      (select min(s.show_date) from public.shows s, today where s.workspace_id = m.workspace_id and s.show_date >= today.d)
    end,
    (select count(*)::int from public.tasks t, today
      where t.workspace_id = m.workspace_id
        and t.progress <> 'completed'
        and auth.uid() = any (t.assignee_ids)
        and t.due_date is not null
        and t.due_date <= today.d + 7)
  from public.workspace_members m
  where m.user_id = auth.uid();
$$;

revoke all on function public.workspace_attention() from public, anon;
grant execute on function public.workspace_attention() to authenticated;

commit;
