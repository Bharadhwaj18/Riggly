-- Demo workspace: every new user gets their own "Demo band" to try things in.
--
-- - Four demo bandmates (Arjun, Meera, Kabir, Zoya, each marked "(demo)") are real accounts that can never sign
--   in (no password, banned). They're members of every demo workspace so splits, tasks and merch crew make sense.
--   Their own personal spaces are removed.
-- - create_demo_workspace() makes the caller's demo (or returns the one they already have), filled with sample
--   shows, setlists, songs, agencies, calendar, tasks, money, notes and merch, dated around today.
-- - reset_demo_workspace(ws) throws the demo away and makes a fresh one.
-- - A demo is marked settings.demo = true and has every section on, whatever the core features are.
--
-- Safe to re-run.

begin;

-- ---- Demo bandmates --------------------------------------------------------------------------------------------------
do $$
declare
  g record;
begin
  for g in select * from (values
    ('d3e00000-0000-4000-8000-000000000001'::uuid, 'Arjun (demo)', 'demo-arjun@demo.rigly.invalid'),
    ('d3e00000-0000-4000-8000-000000000002'::uuid, 'Meera (demo)', 'demo-meera@demo.rigly.invalid'),
    ('d3e00000-0000-4000-8000-000000000003'::uuid, 'Kabir (demo)', 'demo-kabir@demo.rigly.invalid'),
    ('d3e00000-0000-4000-8000-000000000004'::uuid, 'Zoya (demo)', 'demo-zoya@demo.rigly.invalid')
  ) as v(id, name, email)
  loop
    if not exists (select 1 from auth.users where id = g.id) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
        phone_change, phone_change_token, reauthentication_token, banned_until
      ) values (
        '00000000-0000-0000-0000-000000000000', g.id, 'authenticated', 'authenticated', g.email, '', now(),
        '{"provider": "email", "providers": ["email"], "demo": true}'::jsonb, jsonb_build_object('full_name', g.name, 'demo', true), now(), now(),
        '', '', '', '', '', '', '', '', '2999-01-01'
      );
    end if;
    -- The profile trigger normally does this; make sure the name is right either way.
    insert into public.profiles (id, display_name) values (g.id, g.name)
    on conflict (id) do update set display_name = excluded.display_name;
  end loop;
  -- Bandmates don't need personal spaces of their own.
  delete from public.workspaces where type = 'personal' and owner_id in (
    'd3e00000-0000-4000-8000-000000000001', 'd3e00000-0000-4000-8000-000000000002',
    'd3e00000-0000-4000-8000-000000000003', 'd3e00000-0000-4000-8000-000000000004');
end $$;

-- ---- Sample data -------------------------------------------------------------------------------------------------------
-- Internal: fills a fresh demo workspace. Not callable directly.
create or replace function public.seed_demo_workspace(ws uuid, me uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  arjun constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  meera constant uuid := 'd3e00000-0000-4000-8000-000000000002';
  kabir constant uuid := 'd3e00000-0000-4000-8000-000000000003';
  zoya  constant uuid := 'd3e00000-0000-4000-8000-000000000004';
  d date := current_date;
  ag_soundwave uuid; ag_golden uuid;
  s_fest uuid; s_cafe uuid; s_sangeet uuid; s_corp uuid; s_rooftop uuid; s_nye uuid;
  sl_fest uuid; sl_sangeet uuid;
  songs uuid[] := '{}';
  sid uuid;
  board uuid; b_todo uuid; b_doing uuid; b_done uuid;
  tee uuid; stk uuid; v uuid;
  r record;
  i integer := 0;
begin
  -- Agencies
  insert into event_management (workspace_id, name, contact_name, contact_phone, base_location, notes, created_by)
  values (ws, 'Soundwave Events', 'Rohit', '+91 98000 11111', 'Bengaluru', 'Books college fests and corporate nights.', me)
  returning id into ag_soundwave;
  insert into event_management (workspace_id, name, contact_name, contact_phone, base_location, notes, created_by)
  values (ws, 'Golden Hour Weddings', 'Priya', '+91 98000 22222', 'Mumbai', 'Wedding planners. Pay 50% advance.', me)
  returning id into ag_golden;

  -- Shows, from done and dusted to a fresh enquiry
  insert into shows (workspace_id, title, show_date, venue, booking_status, format, fee, fee_received, event_management_id, poc_name, poc_phone, notes, created_by)
  values (ws, 'Spring Beats college fest', d - 40, 'Christ University, Bengaluru', 'Completed', 'College Gig', 60000, true, ag_soundwave, 'Rohit', '+91 98000 11111', '45-minute set, headline slot.', me)
  returning id into s_fest;
  insert into shows (workspace_id, title, show_date, venue, booking_status, format, fee, fee_received, notes, created_by)
  values (ws, 'Friday night at The Humming Tree', d - 12, 'The Humming Tree, Bengaluru', 'Completed', 'Ticketed event', 25000, true, 'Ticketed. Two sets with a break.', me)
  returning id into s_cafe;
  insert into shows (workspace_id, title, show_date, venue, booking_status, format, fee, event_management_id, poc_name, poc_phone, notes, created_by)
  values (ws, 'Mehta sangeet', d + 6, 'Taj West End, Bengaluru', 'Advance Received', 'Wedding/Private event', 120000, ag_golden, 'Priya', '+91 98000 22222', 'Family wants a Bollywood medley for the couple''s entry.', me)
  returning id into s_sangeet;
  insert into shows (workspace_id, title, show_date, venue, booking_status, format, fee, event_management_id, created_by)
  values (ws, 'Acme Tech annual night', d + 18, 'Sheraton Grand, Whitefield', 'Confirmed', 'Corporate events', 80000, ag_soundwave, me)
  returning id into s_corp;
  insert into shows (workspace_id, title, show_date, venue, booking_status, format, fee, notes, created_by)
  values (ws, 'Rooftop session at Skyline', d + 33, 'Skyline Bar, Indiranagar', 'Quotation Shared', 'Mall/Public event', 40000, 'Sent the quote, waiting to hear back.', me)
  returning id into s_rooftop;
  insert into shows (workspace_id, title, show_date, venue, booking_status, notes, created_by)
  values (ws, 'New Year''s Eve party', d + 45, 'Goa (venue to be confirmed)', 'Inquiry', 'They asked for availability and a rough price.', me)
  returning id into s_nye;

  -- Songs: made-up originals, chords only
  for r in select * from (values
    ('Monsoon Letters', 'Demo band', 'G', 92, '4/4', E'{start_of_part: Intro}\nG D Em C\n{end_of_part}\n\n{start_of_part: Verse}\nG D Em C (x2)\n{end_of_part}\n\n{start_of_part: Chorus}\nC G D Em\nC G D D\n{end_of_part}'),
    ('Highway at Dawn', 'Demo band', 'D', 118, '4/4', E'{start_of_part: Verse}\nD A Bm G\n{end_of_part}\n\n{start_of_part: Chorus}\nG A D Bm\nG A D D\n{end_of_part}\n\nBridge - Em G A A'),
    ('Chai and Static', 'Demo band', 'Am', 84, '4/4', E'{start_of_part: Verse}\nAm F C G\n{end_of_part}\n\n{start_of_part: Chorus}\nF G Am Am\nF G C E\n{end_of_part}'),
    ('Paper Kites', 'Demo band', 'C', 100, '4/4', E'{start_of_part: Verse}\nC Am F G\n{end_of_part}\n\n{start_of_part: Chorus}\nF G Em Am\nF G C C\n{end_of_part}'),
    ('Old City Lights', 'Demo band', 'E', 126, '4/4', E'Intro - E B C#m A\n\n{start_of_part: Verse}\nE B C#m A\n{end_of_part}\n\n{start_of_part: Chorus}\nA B E C#m\nA B E E\n{end_of_part}'),
    ('Saffron Sky', 'Demo band', 'F#m', 76, '6/8', E'{start_of_part: Verse}\nF#m D A E\n{end_of_part}\n\n{start_of_part: Chorus}\nD E F#m F#m\nD E A A\n{end_of_part}'),
    ('Last Train Home', 'Demo band', 'A', 110, '4/4', E'{start_of_part: Verse}\nA E F#m D\n{end_of_part}\n\n{start_of_part: Chorus}\nD E A F#m\nD E A A\n{end_of_part}\n\nOutro - D E A (hold)'),
    ('Small Hours', 'Demo band', 'Dm', 68, '3/4', E'{start_of_part: Verse}\nDm Bb F C\n{end_of_part}\n\n{start_of_part: Chorus}\nBb C Dm Dm\nBb C F A\n{end_of_part}'),
    ('Rickshaw Racer', 'Demo band', 'B', 140, '4/4', E'Riff - B A E B (x4)\n\n{start_of_part: Verse}\nB A E B\n{end_of_part}\n\n{start_of_part: Chorus}\nE F# B G#m\nE F# B B\n{end_of_part}'),
    ('Wedding Lights Medley', 'Demo band', 'G', 104, '4/4', E'Medley for entries and sangeets.\n\nPart 1 - G C D G\nPart 2 - Em C G D\nPart 3 - C D G G (big finish)')
  ) as x(title, artist, song_key, bpm, ts, chart)
  loop
    insert into songs (workspace_id, title, artist, song_key, bpm, time_signature, chord_chart, created_by)
    values (ws, r.title, r.artist, r.song_key, r.bpm, r.ts, r.chart, me)
    returning id into sid;
    songs := songs || sid;
  end loop;

  -- Setlists for a past show and the next one
  insert into setlists (workspace_id, title, show_date, venue, show_id, created_by)
  values (ws, 'Spring Beats college fest', d - 40, 'Christ University, Bengaluru', s_fest, me) returning id into sl_fest;
  insert into setlists (workspace_id, title, show_date, venue, show_id, notes, created_by)
  values (ws, 'Mehta sangeet', d + 6, 'Taj West End, Bengaluru', s_sangeet, 'Medley for the couple''s entry, then the main set.', me) returning id into sl_sangeet;
  insert into setlist_songs (workspace_id, setlist_id, song_id, position, section)
  select ws, sl_fest, songs[n], n, 'Main Set' from generate_series(1, 7) n;
  insert into setlist_songs (workspace_id, setlist_id, song_id, position, section) values
    (ws, sl_sangeet, songs[10], 1, 'Entry'),
    (ws, sl_sangeet, songs[1], 2, 'Main Set'), (ws, sl_sangeet, songs[4], 3, 'Main Set'),
    (ws, sl_sangeet, songs[6], 4, 'Main Set'), (ws, sl_sangeet, songs[2], 5, 'Main Set'),
    (ws, sl_sangeet, songs[7], 6, 'Main Set');

  -- Calendar and who's away
  insert into calendar_events (workspace_id, title, start_date, end_date, notes, created_by, visibility) values
    (ws, 'Jam for the sangeet', d + 3, d + 3, 'Run the medley twice.', me, 'details'),
    (ws, 'Studio days', d + 10, d + 11, 'Recording Monsoon Letters.', me, 'details');
  insert into unavailability (workspace_id, member_id, start_date, end_date, reason, visibility)
  values (ws, meera, d + 20, d + 22, 'Family trip', 'details');

  -- Money: show fees in, costs out, one show not split yet
  insert into finance_transactions (workspace_id, member_id, amount, description, category, show_id, date, recorded_by) values
    (ws, me,    60000, 'Spring Beats fee', 'show_fee', s_fest, d - 38, me),
    (ws, arjun, -8000, 'Sound engineer', 'sound', s_fest, d - 40, me),
    (ws, kabir, -2400, 'Cabs to the venue', 'travel', s_fest, d - 40, me),
    (ws, me,    25000, 'Humming Tree fee', 'show_fee', s_cafe, d - 10, me),
    (ws, zoya,  -1800, 'Dinner after the gig', 'food', s_cafe, d - 12, me),
    (ws, me,    60000, 'Sangeet advance (50%)', 'show_fee', s_sangeet, d - 5, me),
    (ws, meera, -4500, 'Jam room, three sessions', 'misc', null, d - 7, me),
    (ws, me,    -3200, 'New guitar strings and cables', 'equipment', null, d - 15, me);
  update shows set split_at = now() - interval '30 days' where id = s_fest;

  -- Tasks
  insert into task_boards (workspace_id, name, labels, created_by) values (ws, 'Band', '[]'::jsonb, me) returning id into board;
  insert into task_buckets (workspace_id, board_id, name, position) values (ws, board, 'To do', 1) returning id into b_todo;
  insert into task_buckets (workspace_id, board_id, name, position) values (ws, board, 'Doing', 2) returning id into b_doing;
  insert into task_buckets (workspace_id, board_id, name, position) values (ws, board, 'Done', 3) returning id into b_done;
  insert into tasks (workspace_id, board_id, bucket_id, title, description, progress, priority, due_date, assignee_ids, checklist, position, created_by) values
    (ws, board, b_todo, 'Send the sangeet setlist to Priya', 'She wants it a week before.', 'not_started', 'urgent', d + 1, array[me], '[]'::jsonb, 1, me),
    (ws, board, b_todo, 'Book cabs for the sangeet', null, 'not_started', 'important', d + 4, array[kabir], '[]'::jsonb, 2, me),
    (ws, board, b_doing, 'Learn the Wedding Lights medley', null, 'in_progress', 'important', d + 3, array[me, arjun, meera, kabir, zoya],
      '[{"id": "c1", "text": "Part 1", "done": true}, {"id": "c2", "text": "Part 2", "done": false}, {"id": "c3", "text": "Big finish", "done": false}]'::jsonb, 1, me),
    (ws, board, b_doing, 'Order more T-shirts in M', 'Running low after the fest.', 'in_progress', 'medium', d + 9, array[zoya], '[]'::jsonb, 2, me),
    (ws, board, b_done, 'Send invoice to Soundwave', null, 'completed', 'medium', d - 35, array[me], '[]'::jsonb, 1, me);
  update tasks set completed_at = now() - interval '35 days' where board_id = board and progress = 'completed';

  -- A shared note for the next show
  insert into notes (workspace_id, title, content, created_by, visibility, show_id, pinned)
  values (ws, 'Sangeet requests', E'Couple''s entry: Wedding Lights medley.\nNo songs after 10:30 pm.\nDJ takes over at 11.', me, 'shared', s_sangeet, true);

  -- Merch: a T-shirt in three sizes and a sticker pack, restocked
  insert into merch_items (workspace_id, name, kind, price, created_by) values (ws, 'Band T-shirt', 'Apparel', 600, me) returning id into tee;
  insert into merch_items (workspace_id, name, kind, price, created_by) values (ws, 'Sticker pack', 'Accessories', 100, me) returning id into stk;
  for r in select * from (values ('S', 15, 1), ('M', 25, 2), ('L', 20, 3)) as x(label, qty, pos) loop
    insert into merch_variants (workspace_id, item_id, label, low_stock_at, position) values (ws, tee, r.label, 5, r.pos) returning id into v;
    insert into merch_stock_moves (workspace_id, variant_id, qty, reason, unit_cost, note, date, created_by)
    values (ws, v, r.qty, 'restock', 250, 'First print run', d - 50, me);
  end loop;
  insert into merch_variants (workspace_id, item_id, label, low_stock_at, position) values (ws, stk, 'One size', 20, 1) returning id into v;
  insert into merch_stock_moves (workspace_id, variant_id, qty, reason, unit_cost, note, date, created_by)
  values (ws, v, 100, 'restock', 20, 'First print run', d - 50, me);
end $$;
revoke all on function public.seed_demo_workspace(uuid, uuid) from public, anon, authenticated;

-- ---- Making and resetting a demo ---------------------------------------------------------------------------------------
create or replace function public.create_demo_workspace()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ws uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select w.id into ws from public.workspaces w
   where w.owner_id = uid and (w.settings ->> 'demo')::boolean is true
   order by w.created_at limit 1;
  if ws is not null then return ws; end if;

  insert into public.workspaces (name, type, owner_id, kind, color, description, settings)
  values ('Demo band', 'band', uid, 'Demo', 'plum', 'A sample band to try Rigly in. Change anything; reset it any time.',
          jsonb_build_object('demo', true, 'features', (select jsonb_object_agg(s, true) from unnest(public.all_sections()) s)))
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role, permissions) values
    (ws, uid, 'owner', '{}'::jsonb),
    (ws, 'd3e00000-0000-4000-8000-000000000001', 'member', '{}'::jsonb),
    (ws, 'd3e00000-0000-4000-8000-000000000002', 'member', '{"treasurer": true}'::jsonb),
    (ws, 'd3e00000-0000-4000-8000-000000000003', 'member', '{}'::jsonb),
    (ws, 'd3e00000-0000-4000-8000-000000000004', 'member', '{"merch_crew": true}'::jsonb);
  perform public.seed_demo_workspace(ws, uid);
  return ws;
end $$;
revoke all on function public.create_demo_workspace() from public, anon;
grant execute on function public.create_demo_workspace() to authenticated;

create or replace function public.reset_demo_workspace(p_ws uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.workspaces w
     where w.id = p_ws and w.owner_id = auth.uid() and (w.settings ->> 'demo')::boolean is true
  ) then
    raise exception 'Only your own demo can be reset.';
  end if;
  delete from public.workspaces where id = p_ws;
  return public.create_demo_workspace();
end $$;
revoke all on function public.reset_demo_workspace(uuid) from public, anon;
grant execute on function public.reset_demo_workspace(uuid) to authenticated;

-- ---- Admin panel knows which workspaces are demos ---------------------------------------------------------------------
drop function if exists public.admin_workspaces();
create function public.admin_workspaces()
returns table (
  id uuid, name text, type text, kind text, color text, plan text, status text, created_at timestamptz,
  owner_id uuid, owner_name text, owner_email text, members integer, features jsonb, demo boolean
)
language plpgsql stable security definer set search_path = public as $f$
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can see this.'; end if;
  return query
    select w.id, w.name, w.type, w.kind, w.color, w.plan, w.status, w.created_at,
           w.owner_id, p.display_name, u.email::text,
           (select count(*)::integer from public.workspace_members m where m.workspace_id = w.id),
           coalesce(w.settings -> 'features', '{}'::jsonb),
           coalesce((w.settings ->> 'demo')::boolean, false)
      from public.workspaces w
      left join public.profiles p on p.id = w.owner_id
      left join auth.users u on u.id = w.owner_id
     order by w.type = 'personal', w.created_at desc;
end $f$;
revoke all on function public.admin_workspaces() from public, anon;
grant execute on function public.admin_workspaces() to authenticated;

commit;
