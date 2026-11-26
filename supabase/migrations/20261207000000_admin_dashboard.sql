-- The platform admin dashboard: overview numbers, every account, workspace plan/pause/rename/delete,
-- what Today shows (card text, cards switched off for everyone or per workspace) and announcements.
-- Everything here is platform-admin only, checked in the database, except today_config, which any member
-- of a workspace calls to draw Today.

begin;

-- ---- Today: the cards a Today screen can show -----------------------------------------------------------------------
-- The band's own cards first, then the app-wide info cards that fill the gaps.
create or replace function public.today_card_ids()
returns text[] language sql immutable as $$
  select array['next', 'actions', 'jump-to', 'tasks', 'money', 'coming-up', 'tip', 'updates', 'review', 'news', 'start', 'tip2']
$$;

-- What the info cards say, and which cards are off for everyone. Missing keys fall back to the app's built-in text.
alter table public.platform_settings add column if not exists today jsonb not null default '{}'::jsonb;

-- A workspace's own switched-off Today cards live in workspaces.settings -> 'today_off'. Like features, only a
-- platform admin may change them; any other settings change keeps them as they were.
create or replace function public.keep_workspace_features()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text;
begin
  if public.is_platform_admin() then return new; end if;
  foreach k in array array['features', 'today_off'] loop
    if (new.settings -> k) is distinct from (old.settings -> k) then
      new.settings := (coalesce(new.settings, '{}'::jsonb) - k)
        || case when old.settings ? k then jsonb_build_object(k, old.settings -> k) else '{}'::jsonb end;
    end if;
  end loop;
  return new;
end $$;

-- ---- Announcements ---------------------------------------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text check (body is null or char_length(body) <= 500),
  link_url text check (link_url is null or (char_length(link_url) <= 500 and link_url ~ '^(https://|/)')),
  link_label text check (link_label is null or char_length(link_label) <= 30),
  tone text not null default 'info' check (tone in ('info', 'good', 'warn')),
  -- null: every workspace. Otherwise only these.
  workspace_ids uuid[],
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  check (ends_at is null or ends_at > starts_at)
);
alter table public.announcements enable row level security;
drop policy if exists announcements_admin on public.announcements;
create policy announcements_admin on public.announcements for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
grant select, insert, update, delete on public.announcements to authenticated;

-- Everything Today needs from the platform, for one workspace the caller belongs to.
create or replace function public.today_config(p_ws uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  ws_off jsonb;
begin
  if not public.is_workspace_member(p_ws) then return null; end if;
  select coalesce(w.settings -> 'today_off', '[]'::jsonb) into ws_off from public.workspaces w where w.id = p_ws;
  return jsonb_build_object(
    'content', coalesce((select s.today from public.platform_settings s where s.id = 1), '{}'::jsonb),
    'workspace_off', coalesce(ws_off, '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'link_url', a.link_url,
                                          'link_label', a.link_label, 'tone', a.tone) order by a.starts_at desc)
        from public.announcements a
       where a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
         and (a.workspace_ids is null or p_ws = any(a.workspace_ids))
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.today_config(uuid) from public, anon;
grant execute on function public.today_config(uuid) to authenticated;

-- ---- Admin: Today ----------------------------------------------------------------------------------------------------
-- The whole Today object at once: tips, updates, reviews, news, start, and off (cards hidden for everyone).
create or replace function public.admin_set_today(p_today jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  clean jsonb := '{}'::jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can change Today.'; end if;
  if p_today is null or jsonb_typeof(p_today) <> 'object' then raise exception 'Today must be an object.'; end if;

  if jsonb_typeof(p_today -> 'tips') = 'array' then
    if jsonb_array_length(p_today -> 'tips') > 30 then raise exception 'At most 30 tips.'; end if;
    if exists (select 1 from jsonb_array_elements_text(p_today -> 'tips') t where char_length(btrim(t)) not between 1 and 200) then
      raise exception 'Each tip must be 1-200 characters.';
    end if;
    clean := clean || jsonb_build_object('tips', p_today -> 'tips');
  end if;
  if jsonb_typeof(p_today -> 'updates') = 'array' then
    if jsonb_array_length(p_today -> 'updates') > 10 then raise exception 'At most 10 updates.'; end if;
    if exists (select 1 from jsonb_array_elements_text(p_today -> 'updates') t where char_length(btrim(t)) not between 1 and 200) then
      raise exception 'Each update must be 1-200 characters.';
    end if;
    clean := clean || jsonb_build_object('updates', p_today -> 'updates');
  end if;
  if jsonb_typeof(p_today -> 'reviews') = 'array' then
    if jsonb_array_length(p_today -> 'reviews') > 20 then raise exception 'At most 20 reviews.'; end if;
    if exists (select 1 from jsonb_array_elements(p_today -> 'reviews') r
                where char_length(btrim(coalesce(r ->> 'quote', ''))) not between 1 and 300
                   or char_length(btrim(coalesce(r ->> 'by', ''))) not between 1 and 60) then
      raise exception 'Each review needs a quote (up to 300 characters) and who said it (up to 60).';
    end if;
    clean := clean || jsonb_build_object('reviews', p_today -> 'reviews');
  end if;
  if p_today ? 'news' then
    if char_length(coalesce(p_today ->> 'news', '')) > 300 then raise exception 'News must be 300 characters or fewer.'; end if;
    clean := clean || jsonb_build_object('news', p_today ->> 'news');
  end if;
  if p_today ? 'start' then
    if char_length(coalesce(p_today ->> 'start', '')) > 300 then raise exception 'Get started must be 300 characters or fewer.'; end if;
    clean := clean || jsonb_build_object('start', p_today ->> 'start');
  end if;
  if jsonb_typeof(p_today -> 'off') = 'array' then
    if exists (select 1 from jsonb_array_elements_text(p_today -> 'off') c where not c = any(public.today_card_ids())) then
      raise exception 'Unknown Today card.';
    end if;
    clean := clean || jsonb_build_object('off', p_today -> 'off');
  end if;

  update public.platform_settings set today = clean, updated_at = now(), updated_by = auth.uid() where id = 1;
end $$;
revoke all on function public.admin_set_today(jsonb) from public, anon;
grant execute on function public.admin_set_today(jsonb) to authenticated;

create or replace function public.admin_set_workspace_today(p_workspace uuid, p_off text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can change Today.'; end if;
  if exists (select 1 from unnest(coalesce(p_off, '{}')) c where not c = any(public.today_card_ids())) then
    raise exception 'Unknown Today card.';
  end if;
  update public.workspaces
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{today_off}', to_jsonb(coalesce(p_off, '{}')), true)
   where id = p_workspace;
  if not found then raise exception 'That workspace is no longer there.'; end if;
end $$;
revoke all on function public.admin_set_workspace_today(uuid, text[]) from public, anon;
grant execute on function public.admin_set_workspace_today(uuid, text[]) to authenticated;

-- ---- Admin: workspaces -----------------------------------------------------------------------------------------------
-- Now also returns each workspace's Today cards that are off, and when anyone in it last signed in.
drop function if exists public.admin_workspaces();
create or replace function public.admin_workspaces()
returns table (
  id uuid, name text, type text, kind text, color text, plan text, status text, created_at timestamptz,
  owner_id uuid, owner_name text, owner_email text, members integer, features jsonb, demo boolean,
  today_off jsonb, last_active timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can see this.'; end if;
  return query
    select w.id, w.name, w.type, w.kind, w.color, w.plan, w.status, w.created_at,
           w.owner_id, p.display_name, u.email::text,
           (select count(*)::integer from public.workspace_members m where m.workspace_id = w.id),
           coalesce(w.settings -> 'features', '{}'::jsonb),
           coalesce((w.settings ->> 'demo')::boolean, false),
           coalesce(w.settings -> 'today_off', '[]'::jsonb),
           (select max(au.last_sign_in_at) from public.workspace_members m join auth.users au on au.id = m.user_id where m.workspace_id = w.id)
      from public.workspaces w
      left join public.profiles p on p.id = w.owner_id
      left join auth.users u on u.id = w.owner_id
     order by w.type = 'personal', w.created_at desc;
end $$;
revoke all on function public.admin_workspaces() from public, anon;
grant execute on function public.admin_workspaces() to authenticated;

-- Rename, set the plan, or pause (status 'blocked') / resume (status 'active') one workspace.
create or replace function public.admin_update_workspace(p_workspace uuid, p_name text, p_plan text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
  clean_plan text := lower(btrim(coalesce(p_plan, '')));
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can change workspaces.'; end if;
  if char_length(clean_name) not between 1 and 60 then raise exception 'Name must be 1-60 characters.'; end if;
  if char_length(clean_plan) not between 1 and 30 then raise exception 'Plan must be 1-30 characters.'; end if;
  if p_status not in ('active', 'read_only', 'blocked') then raise exception 'Unknown status.'; end if;
  update public.workspaces
     set name = clean_name, plan = clean_plan, status = p_status,
         blocked_at = case when p_status = 'blocked' then coalesce(blocked_at, now()) else null end
   where id = p_workspace;
  if not found then raise exception 'That workspace is no longer there.'; end if;
end $$;
revoke all on function public.admin_update_workspace(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_workspace(uuid, text, text, text) to authenticated;

-- Deletes a band workspace and everything in it. The caller types its name to confirm.
create or replace function public.admin_delete_workspace(p_workspace uuid, p_confirm_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ws record;
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can delete workspaces.'; end if;
  select w.name, w.type into ws from public.workspaces w where w.id = p_workspace;
  if not found then raise exception 'That workspace is no longer there.'; end if;
  if ws.type = 'personal' then raise exception 'A personal space can''t be deleted.'; end if;
  if btrim(coalesce(p_confirm_name, '')) <> ws.name then raise exception 'The name typed doesn''t match.'; end if;
  delete from public.workspaces where id = p_workspace;
end $$;
revoke all on function public.admin_delete_workspace(uuid, text) from public, anon;
grant execute on function public.admin_delete_workspace(uuid, text) to authenticated;

-- ---- Admin: people and numbers ---------------------------------------------------------------------------------------
create or replace function public.admin_users()
returns table (
  id uuid, email text, name text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean,
  is_admin boolean, workspaces jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can see this.'; end if;
  return query
    select u.id, u.email::text, p.display_name, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
           exists (select 1 from public.platform_admins a where a.user_id = u.id),
           coalesce((
             select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'role', m.role) order by w.name)
               from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
              where m.user_id = u.id and w.type <> 'personal'
           ), '[]'::jsonb)
      from auth.users u
      left join public.profiles p on p.id = u.id
     order by u.created_at desc;
end $$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- Counts only, never anyone's content.
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can see this.'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'signups_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'bands', (select count(*) from public.workspaces where type <> 'personal' and not coalesce((settings ->> 'demo')::boolean, false)),
    'demos', (select count(*) from public.workspaces where coalesce((settings ->> 'demo')::boolean, false)),
    'personal', (select count(*) from public.workspaces where type = 'personal'),
    'paused', (select count(*) from public.workspaces where status = 'blocked'),
    'bands_7d', (select count(*) from public.workspaces where type <> 'personal' and not coalesce((settings ->> 'demo')::boolean, false) and created_at > now() - interval '7 days'),
    'plans', coalesce((select jsonb_object_agg(plan, n) from (
      select plan, count(*) n from public.workspaces where type <> 'personal' and not coalesce((settings ->> 'demo')::boolean, false) group by plan
    ) x), '{}'::jsonb),
    'signups_by_day', (select jsonb_agg(jsonb_build_object('day', d::date, 'n',
        (select count(*) from auth.users u where u.created_at >= d and u.created_at < d + interval '1 day')) order by d)
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d),
    'announcements_live', (select count(*) from public.announcements a where a.starts_at <= now() and (a.ends_at is null or a.ends_at > now()))
  );
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

commit;
