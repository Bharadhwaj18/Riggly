-- One access model for every feature.
--
-- Each member has, per feature (section): 'none' | 'items' (only the items shared with them) | 'view' | 'edit'.
--   workspace_members.permissions.sections.<section>   (missing = 'edit', as before)
--   workspace_members.permissions.access_until          'YYYY-MM-DD': from the next day (India time) they see nothing
--   workspace_members.permissions.access_manager        true: can change other members' access (not owners/admins/themselves)
-- Items shared with a member live in access_grants (one row per item, view or edit, optional last day).
-- What's inside a shared item comes along, view only: a show's setlists, documents and notes; a setlist's songs
-- (and their references and notes); a task list's tasks; a note's checklist; a kit's lines and sales;
-- a finance project's or budget's entries.
-- Someone with 'items' can't create new top-level items in that feature.
-- Merch crew = Merch 'items'; kits they're on (lead or helper) are shared with them automatically.
-- Replaces the setlist-guest special case (its members and links are moved over). Safe to re-run.

begin;

-- ---------------------------------------------------------------- shared items

create table if not exists public.access_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  section text not null check (section in ('shows','setlists','songs','recordings','finance','merch','calendar','tasks','notes','agencies')),
  item_id uuid not null,
  level text not null default 'view' check (level in ('view', 'edit')),
  until date,
  granted_by uuid,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id, section, item_id),
  foreign key (workspace_id, user_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);
create index if not exists access_grants_item on public.access_grants (workspace_id, section, item_id);
alter table public.access_grants enable row level security;

-- ---------------------------------------------------------------- who can do what

-- Past their last day (owners and admins never are).
create or replace function public.member_access_ended(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select m.role not in ('owner', 'admin')
       and (m.permissions ->> 'access_until') ~ '^\d{4}-\d{2}-\d{2}$'
       and now() >= (((m.permissions ->> 'access_until')::date + 1)::timestamp at time zone 'Asia/Kolkata')
      from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()
  ), false)
$$;

-- 'none' | 'items' | 'view' | 'edit' for the signed-in member.
create or replace function public.section_scope(ws uuid, sec text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when not public.workspace_feature_on(ws, sec) then 'none'
      when m.role in ('owner', 'admin') then 'edit'
      when public.member_access_ended(ws) then 'none'
      when sec = 'merch' and m.permissions ->> 'merch_crew' = 'true' then 'items'
      when m.permissions -> 'sections' ->> sec in ('none', 'items', 'view', 'edit') then m.permissions -> 'sections' ->> sec
      else 'edit'
    end
    from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()
  ), 'none')
$$;

-- Whole-section level, as every older check expects: someone with only shared items counts as 'none' here.
create or replace function public.section_level(ws uuid, sec text)
returns text language sql stable security definer set search_path = public as $$
  select case public.section_scope(ws, sec) when 'items' then 'none' else public.section_scope(ws, sec) end
$$;

-- The best still-valid grant on one item: 'none' | 'view' | 'edit'.
create or replace function public.grant_level(ws uuid, sec text, item uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when bool_or(g.level = 'edit') then 'edit' else 'view' end
      from public.access_grants g
     where g.workspace_id = ws and g.user_id = auth.uid() and g.section = sec and g.item_id = item
       and (g.until is null or now() < ((g.until + 1)::timestamp at time zone 'Asia/Kolkata'))
    having count(*) > 0
  ), 'none')
$$;

-- What the member can do with one item, directly (no come-along). Null item = "anything in the section".
create or replace function public.item_level(ws uuid, sec text, item uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare s text := public.section_scope(ws, sec);
begin
  if s in ('view', 'edit') then return s; end if;
  if s <> 'items' or item is null then return 'none'; end if;
  return public.grant_level(ws, sec, item);
end $$;

-- What the member can see of one item, including what comes along with a shared parent (view only).
create or replace function public.read_level(ws uuid, sec text, item uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare l text := public.item_level(ws, sec, item);
begin
  if l <> 'none' or item is null then return l; end if;
  if not public.workspace_feature_on(ws, sec) or public.member_access_ended(ws) then return 'none'; end if;
  if sec = 'setlists' then
    if exists (select 1 from public.setlists s where s.id = item and s.show_id is not null
               and public.read_level(ws, 'shows', s.show_id) <> 'none') then return 'view'; end if;
  elsif sec = 'songs' then
    if exists (select 1 from public.setlist_songs ss where ss.song_id = item and ss.workspace_id = ws
               and public.read_level(ws, 'setlists', ss.setlist_id) <> 'none') then return 'view'; end if;
  elsif sec = 'notes' then
    if exists (select 1 from public.notes n where n.id = item
               and ((n.show_id is not null and public.read_level(ws, 'shows', n.show_id) <> 'none')
                 or (n.song_id is not null and public.read_level(ws, 'songs', n.song_id) <> 'none'))) then return 'view'; end if;
  end if;
  return 'none';
end $$;

-- Can change this item (or, with a null item, create new things in the section).
create or replace function public.write_ok(ws uuid, sec text, item uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare s text := public.section_scope(ws, sec);
begin
  if s = 'edit' then return true; end if;
  return s = 'items' and item is not null and public.grant_level(ws, sec, item) = 'edit';
end $$;

-- Owner, admins and Access managers (while their own access lasts).
create or replace function public.can_manage_access(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
     where m.workspace_id = ws and m.user_id = auth.uid()
       and (m.role in ('owner', 'admin') or (m.permissions ->> 'access_manager' = 'true' and not public.member_access_ended(ws)))
  )
$$;

-- People outside the band's day-to-day (no whole feature open to them): left out of member counts and pickers.
create or replace function public.is_limited_member(p_role text, p_permissions jsonb)
returns boolean language sql immutable set search_path = public as $$
  select p_role not in ('owner', 'admin') and (
    coalesce(p_permissions ->> 'merch_crew', 'false') = 'true'
    or not exists (
      select 1 from unnest(array['shows','setlists','songs','recordings','finance','merch','calendar','tasks','notes','agencies']) k
       where coalesce(p_permissions -> 'sections' ->> k, 'edit') in ('view', 'edit')
    )
  )
$$;

revoke all on function public.member_access_ended(uuid) from public, anon;
revoke all on function public.section_scope(uuid, text) from public, anon;
revoke all on function public.grant_level(uuid, text, uuid) from public, anon;
revoke all on function public.item_level(uuid, text, uuid) from public, anon;
revoke all on function public.read_level(uuid, text, uuid) from public, anon;
revoke all on function public.write_ok(uuid, text, uuid) from public, anon;
revoke all on function public.can_manage_access(uuid) from public, anon;
grant execute on function public.member_access_ended(uuid) to authenticated;
grant execute on function public.section_scope(uuid, text) to authenticated;
grant execute on function public.grant_level(uuid, text, uuid) to authenticated;
grant execute on function public.item_level(uuid, text, uuid) to authenticated;
grant execute on function public.read_level(uuid, text, uuid) to authenticated;
grant execute on function public.write_ok(uuid, text, uuid) to authenticated;
grant execute on function public.can_manage_access(uuid) to authenticated;
grant execute on function public.is_limited_member(text, jsonb) to authenticated;

drop policy if exists access_grants_read on public.access_grants;
create policy access_grants_read on public.access_grants for select to authenticated
  using (user_id = auth.uid() or public.can_manage_access(workspace_id));

-- ---------------------------------------------------------------- the rules on every feature's tables

-- (table, section, item expression for reads/writes). A null item means only whole-section access counts.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('shows',             'shows',      'id'),
    ('show_documents',    'shows',      'show_id'),
    ('setlists',          'setlists',   'id'),
    ('setlist_songs',     'setlists',   'setlist_id'),
    ('songs',             'songs',      'id'),
    ('song_references',   'songs',      'song_id'),
    ('recordings',        'recordings', 'id'),
    ('calendar_events',   'calendar',   'id'),
    ('unavailability',    'calendar',   'null::uuid'),
    ('task_boards',       'tasks',      'id'),
    ('task_buckets',      'tasks',      'board_id'),
    ('tasks',             'tasks',      'board_id'),
    ('notes',             'notes',      'id'),
    ('event_management',  'agencies',   'id'),
    ('finance_projects',  'finance',    'id'),
    ('budgets',           'finance',    'id'),
    ('finance_accounts',  'finance',    'null::uuid'),
    ('finance_recurring', 'finance',    'null::uuid'),
    ('pending_payments',  'finance',    'null::uuid'),
    ('split_runs',        'finance',    'null::uuid')
  ) as t(tbl, sec, item) loop
    execute format('drop policy if exists ws_section_read on public.%I', r.tbl);
    execute format('drop policy if exists ws_section_insert on public.%I', r.tbl);
    execute format('drop policy if exists ws_section_update on public.%I', r.tbl);
    execute format('drop policy if exists ws_section_delete on public.%I', r.tbl);
    execute format('create policy ws_section_read on public.%I as restrictive for select to authenticated using (public.read_level(workspace_id, %L, %s) <> ''none'')', r.tbl, r.sec, r.item);
    execute format('create policy ws_section_insert on public.%I as restrictive for insert to authenticated with check (public.write_ok(workspace_id, %L, %s))', r.tbl, r.sec, r.item);
    execute format('create policy ws_section_update on public.%I as restrictive for update to authenticated using (public.write_ok(workspace_id, %L, %s)) with check (public.write_ok(workspace_id, %L, %s))', r.tbl, r.sec, r.item, r.sec, r.item);
    execute format('create policy ws_section_delete on public.%I as restrictive for delete to authenticated using (public.write_ok(workspace_id, %L, %s))', r.tbl, r.sec, r.item);
  end loop;
end $$;

-- Task fields (column names) are shared by every list: readable with any Tasks access, changed with full edit.
drop policy if exists ws_section_read on public.task_fields;
drop policy if exists ws_section_insert on public.task_fields;
drop policy if exists ws_section_update on public.task_fields;
drop policy if exists ws_section_delete on public.task_fields;
create policy ws_section_read on public.task_fields as restrictive for select to authenticated using (public.section_scope(workspace_id, 'tasks') <> 'none');
create policy ws_section_insert on public.task_fields as restrictive for insert to authenticated with check (public.write_ok(workspace_id, 'tasks', null));
create policy ws_section_update on public.task_fields as restrictive for update to authenticated using (public.write_ok(workspace_id, 'tasks', null)) with check (public.write_ok(workspace_id, 'tasks', null));
create policy ws_section_delete on public.task_fields as restrictive for delete to authenticated using (public.write_ok(workspace_id, 'tasks', null));

-- A note's checklist follows its note.
drop policy if exists ws_section_read on public.note_checklist_items;
drop policy if exists ws_section_insert on public.note_checklist_items;
drop policy if exists ws_section_update on public.note_checklist_items;
drop policy if exists ws_section_delete on public.note_checklist_items;
create policy ws_section_read on public.note_checklist_items as restrictive for select to authenticated
  using (exists (select 1 from public.notes p where p.id = note_checklist_items.note_id and public.read_level(p.workspace_id, 'notes', p.id) <> 'none'));
create policy ws_section_insert on public.note_checklist_items as restrictive for insert to authenticated
  with check (exists (select 1 from public.notes p where p.id = note_checklist_items.note_id and public.write_ok(p.workspace_id, 'notes', p.id)));
create policy ws_section_update on public.note_checklist_items as restrictive for update to authenticated
  using (exists (select 1 from public.notes p where p.id = note_checklist_items.note_id and public.write_ok(p.workspace_id, 'notes', p.id)))
  with check (exists (select 1 from public.notes p where p.id = note_checklist_items.note_id and public.write_ok(p.workspace_id, 'notes', p.id)));
create policy ws_section_delete on public.note_checklist_items as restrictive for delete to authenticated
  using (exists (select 1 from public.notes p where p.id = note_checklist_items.note_id and public.write_ok(p.workspace_id, 'notes', p.id)));

-- A budget's adjustments follow the budget.
drop policy if exists ws_section_read on public.budget_adjustments;
drop policy if exists ws_section_insert on public.budget_adjustments;
drop policy if exists ws_section_update on public.budget_adjustments;
drop policy if exists ws_section_delete on public.budget_adjustments;
create policy ws_section_read on public.budget_adjustments as restrictive for select to authenticated
  using (exists (select 1 from public.budgets p where p.id = budget_adjustments.budget_id and public.read_level(p.workspace_id, 'finance', p.id) <> 'none'));
create policy ws_section_insert on public.budget_adjustments as restrictive for insert to authenticated
  with check (exists (select 1 from public.budgets p where p.id = budget_adjustments.budget_id and public.write_ok(p.workspace_id, 'finance', p.id)));
create policy ws_section_update on public.budget_adjustments as restrictive for update to authenticated
  using (exists (select 1 from public.budgets p where p.id = budget_adjustments.budget_id and public.write_ok(p.workspace_id, 'finance', p.id)))
  with check (exists (select 1 from public.budgets p where p.id = budget_adjustments.budget_id and public.write_ok(p.workspace_id, 'finance', p.id)));
create policy ws_section_delete on public.budget_adjustments as restrictive for delete to authenticated
  using (exists (select 1 from public.budgets p where p.id = budget_adjustments.budget_id and public.write_ok(p.workspace_id, 'finance', p.id)));

-- Finance entries come along with the project or budget they're tagged to.
drop policy if exists ws_section_read on public.finance_transactions;
drop policy if exists ws_section_insert on public.finance_transactions;
drop policy if exists ws_section_update on public.finance_transactions;
drop policy if exists ws_section_delete on public.finance_transactions;
create policy ws_section_read on public.finance_transactions as restrictive for select to authenticated
  using (public.read_level(workspace_id, 'finance', project_id) <> 'none' or public.read_level(workspace_id, 'finance', budget_id) <> 'none');
create policy ws_section_insert on public.finance_transactions as restrictive for insert to authenticated
  with check (public.write_ok(workspace_id, 'finance', project_id) or public.write_ok(workspace_id, 'finance', budget_id));
create policy ws_section_update on public.finance_transactions as restrictive for update to authenticated
  using (public.write_ok(workspace_id, 'finance', project_id) or public.write_ok(workspace_id, 'finance', budget_id))
  with check (public.write_ok(workspace_id, 'finance', project_id) or public.write_ok(workspace_id, 'finance', budget_id));
create policy ws_section_delete on public.finance_transactions as restrictive for delete to authenticated
  using (public.write_ok(workspace_id, 'finance', project_id) or public.write_ok(workspace_id, 'finance', budget_id));

-- Bank checks: whole Finance only (they only had a read rule).
drop policy if exists ws_section_read on public.finance_account_checks;
create policy ws_section_read on public.finance_account_checks as restrictive for select to authenticated
  using (public.read_level(workspace_id, 'finance', null) <> 'none');

-- ---------------------------------------------------------------- Merch: crew is Merch 'items'

-- On the kit (lead or helper) or given edit on it: can sell from it and close it.
create or replace function public.merch_kit_mine(p_kit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merch_kits k
     where k.id = p_kit and not public.member_access_ended(k.workspace_id)
       and (k.lead_id = auth.uid() or auth.uid() = any (k.helper_ids) or public.grant_level(k.workspace_id, 'merch', k.id) = 'edit')
  )
$$;

-- Can see the kit: on it, or it's shared with them (view or edit).
create or replace function public.merch_kit_visible(p_kit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merch_kits k
     where k.id = p_kit and not public.member_access_ended(k.workspace_id)
       and (k.lead_id = auth.uid() or auth.uid() = any (k.helper_ids) or public.grant_level(k.workspace_id, 'merch', k.id) <> 'none')
  )
$$;
revoke all on function public.merch_kit_visible(uuid) from public, anon;
grant execute on function public.merch_kit_visible(uuid) to authenticated;

create or replace function public.merch_scope(ws uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when not public.workspace_feature_on(ws, 'merch') then 'none'
      when m.role in ('owner', 'admin') then 'full'
      when public.member_access_ended(ws) then 'none'
      when m.permissions ->> 'merch_manager' = 'true' then 'full'
      else case public.section_scope(ws, 'merch') when 'items' then 'crew' when 'none' then 'none' else 'full' end
    end
    from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()
  ), 'none')
$$;

create or replace function public.merch_item_in_my_kit(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merch_variants v
      join public.merch_kit_lines l on l.variant_id = v.id
     where v.item_id = p_item and public.merch_kit_visible(l.kit_id)
  )
$$;

create or replace function public.merch_variant_in_my_kit(p_variant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.merch_kit_lines l where l.variant_id = p_variant and public.merch_kit_visible(l.kit_id))
$$;

drop policy if exists ws_section_read on public.merch_kits;
create policy ws_section_read on public.merch_kits as restrictive for select to authenticated
  using (public.merch_scope(workspace_id) = 'full' or (public.merch_scope(workspace_id) = 'crew' and public.merch_kit_visible(id)));
drop policy if exists ws_section_read on public.merch_kit_lines;
create policy ws_section_read on public.merch_kit_lines as restrictive for select to authenticated
  using (public.merch_scope(workspace_id) = 'full' or (public.merch_scope(workspace_id) = 'crew' and public.merch_kit_visible(kit_id)));
drop policy if exists ws_section_read on public.merch_sales;
create policy ws_section_read on public.merch_sales as restrictive for select to authenticated
  using (public.merch_scope(workspace_id) = 'full' or (public.merch_scope(workspace_id) = 'crew' and kit_id is not null and public.merch_kit_visible(kit_id)));
drop policy if exists ws_section_read on public.merch_stock_moves;
create policy ws_section_read on public.merch_stock_moves as restrictive for select to authenticated
  using (public.merch_scope(workspace_id) = 'full' or (public.merch_scope(workspace_id) = 'crew' and kit_id is not null and public.merch_kit_visible(kit_id)));

create or replace function public.my_merch_kits(p_ws uuid)
returns table (id uuid, show_id uuid, show_title text, show_date date, venue text, status text, lead_id uuid, helper_ids uuid[], closed_at timestamptz, approved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select k.id, k.show_id, s.title, s.show_date, s.venue, k.status, k.lead_id, k.helper_ids, k.closed_at, k.approved_at
    from public.merch_kits k left join public.shows s on s.id = k.show_id
   where k.workspace_id = p_ws and public.merch_kit_visible(k.id)
   order by s.show_date desc nulls last, k.created_at desc
$$;

-- ---------------------------------------------------------------- changing someone's access

-- Does this item exist in this workspace's feature?
create or replace function public.access_item_exists(ws uuid, sec text, item uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return case sec
    when 'shows'      then exists (select 1 from public.shows where id = item and workspace_id = ws)
    when 'setlists'   then exists (select 1 from public.setlists where id = item and workspace_id = ws)
    when 'songs'      then exists (select 1 from public.songs where id = item and workspace_id = ws)
    when 'recordings' then exists (select 1 from public.recordings where id = item and workspace_id = ws)
    when 'calendar'   then exists (select 1 from public.calendar_events where id = item and workspace_id = ws)
    when 'tasks'      then exists (select 1 from public.task_boards where id = item and workspace_id = ws)
    when 'notes'      then exists (select 1 from public.notes where id = item and workspace_id = ws)
    when 'agencies'   then exists (select 1 from public.event_management where id = item and workspace_id = ws)
    when 'finance'    then exists (select 1 from public.finance_projects where id = item and workspace_id = ws)
                        or exists (select 1 from public.budgets where id = item and workspace_id = ws)
    when 'merch'      then exists (select 1 from public.merch_kits where id = item and workspace_id = ws)
    else false
  end;
end $$;
revoke all on function public.access_item_exists(uuid, text, uuid) from public, anon;

-- Replace a member's grants with p_grants: [{section, item_id, level, until}]. Items not in the workspace are skipped.
create or replace function public.apply_access_grants(ws uuid, p_user uuid, p_grants jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare g jsonb;
begin
  delete from public.access_grants where workspace_id = ws and user_id = p_user;
  for g in select * from jsonb_array_elements(case when jsonb_typeof(p_grants) = 'array' then p_grants else '[]'::jsonb end) loop
    continue when coalesce(g ->> 'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    continue when not public.access_item_exists(ws, g ->> 'section', (g ->> 'item_id')::uuid);
    insert into public.access_grants (workspace_id, user_id, section, item_id, level, until, granted_by)
    values (ws, p_user, g ->> 'section', (g ->> 'item_id')::uuid,
            case when g ->> 'level' = 'edit' then 'edit' else 'view' end,
            case when coalesce(g ->> 'until', '') ~ '^\d{4}-\d{2}-\d{2}$' then (g ->> 'until')::date end,
            auth.uid())
    on conflict (workspace_id, user_id, section, item_id) do update set level = excluded.level, until = excluded.until;
  end loop;
end $$;
revoke all on function public.apply_access_grants(uuid, uuid, jsonb) from public, anon, authenticated;

-- Set everything about one member's access at once. Owner, admins and Access managers only; never the owner,
-- an admin, or yourself. Only owners and admins can make someone an Access manager.
create or replace function public.set_member_access(p_ws uuid, p_user uuid, p_sections jsonb, p_access_until date, p_grants jsonb, p_access_manager boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.workspace_members%rowtype;
  me_admin boolean := public.is_workspace_admin(p_ws);
  clean jsonb := '{}'::jsonb;
  k text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not public.can_manage_access(p_ws) then raise exception 'Only admins and Access managers can change access.'; end if;
  if p_user = auth.uid() then raise exception 'You can’t change your own access.'; end if;
  select * into t from public.workspace_members where workspace_id = p_ws and user_id = p_user for update;
  if t.user_id is null then raise exception 'They aren’t in this workspace.'; end if;
  if t.role in ('owner', 'admin') then raise exception 'Owners and admins always have full access.'; end if;
  if p_access_manager is not null and not me_admin then raise exception 'Only an admin can make someone an Access manager.'; end if;
  if p_access_until is not null and p_access_until < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The last day can’t be in the past.';
  end if;

  foreach k in array array['shows','setlists','songs','recordings','finance','merch','calendar','tasks','notes','agencies'] loop
    if p_sections ->> k in ('none', 'items', 'view', 'edit') then clean := clean || jsonb_build_object(k, p_sections ->> k); end if;
  end loop;

  update public.workspace_members m
     set permissions = (coalesce(m.permissions, '{}'::jsonb) - 'merch_crew' - 'setlist_guest' - 'setlist_ids' - 'access_until')
           || jsonb_build_object('sections', clean)
           || case when p_access_until is not null then jsonb_build_object('access_until', to_char(p_access_until, 'YYYY-MM-DD')) else '{}'::jsonb end
           || case when p_access_manager is not null then jsonb_build_object('access_manager', p_access_manager) else '{}'::jsonb end
   where m.workspace_id = p_ws and m.user_id = p_user;

  perform public.apply_access_grants(p_ws, p_user, p_grants);
end $$;
revoke all on function public.set_member_access(uuid, uuid, jsonb, date, jsonb, boolean) from public, anon;
grant execute on function public.set_member_access(uuid, uuid, jsonb, date, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------- invite links carry the same access

-- invite permissions: { sections, access_until, grants: [...], merch_crew (old links) }
create or replace function public.join_with_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
  v_perm jsonb;
  v_role text;
  v_was_member boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to join'; end if;

  select i.workspace_id, coalesce(i.permissions, '{}'::jsonb), i.role into v_ws, v_perm, v_role
    from public.workspace_invites i where i.token = p_token;
  if v_ws is null then raise exception 'Invite link not found'; end if;

  v_was_member := exists (select 1 from public.workspace_members m where m.workspace_id = v_ws and m.user_id = auth.uid());

  -- All the existing checks (expired, revoked, used up, workspace unavailable) still happen here.
  v_ws := public.accept_workspace_invite(p_token);

  -- Only a NEW member gets the invite's access; someone already in the workspace keeps what they have.
  if not v_was_member and v_role <> 'admin' then
    update public.workspace_members m
       set permissions = coalesce(m.permissions, '{}'::jsonb)
             || case when jsonb_typeof(v_perm -> 'sections') = 'object' then jsonb_build_object('sections', v_perm -> 'sections') else '{}'::jsonb end
             || case when v_perm ->> 'merch_crew' = 'true'
                     then jsonb_build_object('sections', coalesce(v_perm -> 'sections', '{}'::jsonb) || '{"merch":"items"}'::jsonb) else '{}'::jsonb end
             || case when (v_perm ->> 'access_until') ~ '^\d{4}-\d{2}-\d{2}$' then jsonb_build_object('access_until', v_perm ->> 'access_until') else '{}'::jsonb end
     where m.workspace_id = v_ws and m.user_id = auth.uid() and m.role not in ('owner', 'admin');
    perform public.apply_access_grants(v_ws, auth.uid(), v_perm -> 'grants');
  end if;

  return v_ws;
end $$;
revoke all on function public.join_with_invite(text) from public, anon;
grant execute on function public.join_with_invite(text) to authenticated;

-- For the invite page: what a link opens. The token is the secret.
-- { sections, access_until, items: [{section, title}] } ; null for admin links.
create or replace function public.invite_access(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i public.workspace_invites%rowtype;
begin
  select * into i from public.workspace_invites where token = p_token;
  if i.id is null or i.role = 'admin' then return null; end if;
  return jsonb_build_object(
    'sections', coalesce(i.permissions -> 'sections', '{}'::jsonb)
                || case when i.permissions ->> 'merch_crew' = 'true' then '{"merch":"items"}'::jsonb else '{}'::jsonb end,
    'access_until', i.permissions -> 'access_until',
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('section', g ->> 'section', 'title', coalesce(
        case g ->> 'section'
          when 'shows'    then (select s.title from public.shows s where s.id::text = g ->> 'item_id' and s.workspace_id = i.workspace_id)
          when 'setlists' then (select s.title from public.setlists s where s.id::text = g ->> 'item_id' and s.workspace_id = i.workspace_id)
          when 'songs'    then (select s.title from public.songs s where s.id::text = g ->> 'item_id' and s.workspace_id = i.workspace_id)
          when 'tasks'    then (select b.name from public.task_boards b where b.id::text = g ->> 'item_id' and b.workspace_id = i.workspace_id)
          when 'notes'    then (select n.title from public.notes n where n.id::text = g ->> 'item_id' and n.workspace_id = i.workspace_id)
          when 'calendar' then (select e.title from public.calendar_events e where e.id::text = g ->> 'item_id' and e.workspace_id = i.workspace_id)
          when 'agencies' then (select a.name from public.event_management a where a.id::text = g ->> 'item_id' and a.workspace_id = i.workspace_id)
          when 'finance'  then coalesce((select p.name from public.finance_projects p where p.id::text = g ->> 'item_id' and p.workspace_id = i.workspace_id),
                                        (select b.name from public.budgets b where b.id::text = g ->> 'item_id' and b.workspace_id = i.workspace_id))
          when 'recordings' then (select r.title from public.recordings r where r.id::text = g ->> 'item_id' and r.workspace_id = i.workspace_id)
          when 'merch'    then (select coalesce(s.title, 'Merch kit') from public.merch_kits k left join public.shows s on s.id = k.show_id where k.id::text = g ->> 'item_id' and k.workspace_id = i.workspace_id)
        end, '')))
      from jsonb_array_elements(case when jsonb_typeof(i.permissions -> 'grants') = 'array' then i.permissions -> 'grants' else '[]'::jsonb end) g
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.invite_access(text) from public;
grant execute on function public.invite_access(text) to anon, authenticated;

-- Old crew-check for the invite page, kept working for links made before this.
create or replace function public.invite_crew(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(i.permissions ->> 'merch_crew' = 'true' or i.permissions -> 'sections' ->> 'merch' = 'items', false) and i.role <> 'admin'
    from public.workspace_invites i where i.token = p_token;
$$;

-- ---------------------------------------------------------------- the switcher's member count leaves out limited people

create or replace function public.workspace_attention()
returns table (workspace_id uuid, member_count integer, next_show_date date, tasks_due integer)
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Asia/Kolkata')::date as d)
  select
    m.workspace_id,
    (select count(*)::int from public.workspace_members x
      where x.workspace_id = m.workspace_id and not public.is_limited_member(x.role, x.permissions)),
    case when public.section_level(m.workspace_id, 'shows') <> 'none' then
      (select min(s.show_date) from public.shows s, today where s.workspace_id = m.workspace_id and s.show_date >= today.d)
    end,
    (select count(*)::int from public.tasks t, today
      where t.workspace_id = m.workspace_id
        and t.progress <> 'completed'
        and auth.uid() = any (t.assignee_ids)
        and t.due_date is not null
        and t.due_date <= today.d + 7
        and public.read_level(t.workspace_id, 'tasks', t.board_id) <> 'none')
  from public.workspace_members m
  where m.user_id = auth.uid();
$$;
revoke all on function public.workspace_attention() from public, anon;
grant execute on function public.workspace_attention() to authenticated;

-- ---------------------------------------------------------------- move the old special cases over

-- Merch crew -> Merch 'items' (their kits come from being on them).
update public.workspace_members
   set permissions = (permissions - 'merch_crew') || jsonb_build_object('sections', coalesce(permissions -> 'sections', '{}'::jsonb) || '{"merch":"items"}'::jsonb)
 where permissions ->> 'merch_crew' = 'true' and role not in ('owner', 'admin');

update public.workspace_invites
   set permissions = (permissions - 'merch_crew') || jsonb_build_object('sections', coalesce(permissions -> 'sections', '{}'::jsonb) || '{"merch":"items"}'::jsonb)
 where permissions ->> 'merch_crew' = 'true' and role <> 'admin';

-- Setlist guests -> Setlists 'items' with a view grant per setlist; everything else off.
insert into public.access_grants (workspace_id, user_id, section, item_id, level)
select m.workspace_id, m.user_id, 'setlists', v::uuid, 'view'
  from public.workspace_members m
  cross join lateral jsonb_array_elements_text(case when jsonb_typeof(m.permissions -> 'setlist_ids') = 'array' then m.permissions -> 'setlist_ids' else '[]'::jsonb end) v
 where m.permissions ->> 'setlist_guest' = 'true'
   and v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and exists (select 1 from public.setlists s where s.id = v::uuid and s.workspace_id = m.workspace_id)
on conflict do nothing;

update public.workspace_members
   set permissions = (permissions - 'setlist_guest' - 'setlist_ids')
         || '{"sections":{"shows":"none","setlists":"items","songs":"none","recordings":"none","finance":"none","merch":"none","calendar":"none","tasks":"none","notes":"none","agencies":"none"}}'::jsonb
 where permissions ->> 'setlist_guest' = 'true' and role not in ('owner', 'admin');

update public.workspace_invites i
   set permissions = (i.permissions - 'setlist_guest' - 'setlist_ids')
         || '{"sections":{"shows":"none","setlists":"items","songs":"none","recordings":"none","finance":"none","merch":"none","calendar":"none","tasks":"none","notes":"none","agencies":"none"}}'::jsonb
         || jsonb_build_object('grants', coalesce((
              select jsonb_agg(jsonb_build_object('section', 'setlists', 'item_id', v, 'level', 'view'))
                from jsonb_array_elements_text(case when jsonb_typeof(i.permissions -> 'setlist_ids') = 'array' then i.permissions -> 'setlist_ids' else '[]'::jsonb end) v
            ), '[]'::jsonb))
 where i.permissions ->> 'setlist_guest' = 'true' and i.role <> 'admin';

-- The setlist-guest special case is gone.
drop policy if exists guest_setlists_read on public.setlists;
drop policy if exists guest_setlist_songs_read on public.setlist_songs;
drop policy if exists guest_songs_read on public.songs;
drop policy if exists guest_song_references_read on public.song_references;
drop function if exists public.invite_setlist_guest(text);
drop function if exists public.guest_setlist_ids(uuid);
drop function if exists public.setlist_guest_state(uuid);

commit;
