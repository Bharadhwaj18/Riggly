-- Workspace features and the platform admin panel.
--
-- Features: each workspace can have whole sections switched off (workspaces.settings -> 'features' -> '<section>'
-- = false). A switched-off section is hidden from everyone in that workspace, owners included, and blocked in the
-- database too (section_level / merch_scope return 'none'). A missing key means on, so every existing workspace,
-- Tarana included, keeps everything.
--
-- Core features: the sections a brand-new band workspace starts with, chosen in the admin panel
-- (platform_settings.core_features). Personal spaces and existing workspaces are not touched.
--
-- Platform admins: people who can open /admin, see every workspace and change its features. Only platform admins
-- can change a workspace's features; nobody else can, through any function.
--
-- Safe to re-run.

begin;

-- ---- Platform admins -------------------------------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
drop policy if exists platform_admins_self on public.platform_admins;
create policy platform_admins_self on public.platform_admins for select to authenticated using (user_id = auth.uid());
grant select on public.platform_admins to authenticated;

-- The first admin (Bharadwaj).
insert into public.platform_admins (user_id)
select id from auth.users where id = '2a782be2-ba58-4da7-9e38-e666ae0f5515'
on conflict do nothing;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ---- Platform settings (one row) -------------------------------------------------------------------------------------
create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  core_features text[] not null default array['shows', 'setlists', 'songs', 'calendar', 'tasks'],
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_admin on public.platform_settings;
create policy platform_settings_admin on public.platform_settings for select to authenticated using (public.is_platform_admin());
grant select on public.platform_settings to authenticated;
insert into public.platform_settings (id) values (1) on conflict do nothing;

-- ---- Features ----------------------------------------------------------------------------------------------------------
create or replace function public.all_sections()
returns text[] language sql immutable as $$
  select array['shows', 'setlists', 'songs', 'recordings', 'finance', 'merch', 'calendar', 'tasks', 'notes', 'agencies']
$$;

create or replace function public.workspace_feature_on(ws uuid, sec text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (w.settings -> 'features' ->> sec)::boolean from public.workspaces w where w.id = ws), true)
$$;
revoke all on function public.workspace_feature_on(uuid, text) from public, anon;
grant execute on function public.workspace_feature_on(uuid, text) to authenticated;

-- A switched-off feature is 'none' for everyone, before any member setting.
create or replace function public.section_level(ws uuid, sec text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when not public.workspace_feature_on(ws, sec) then 'none'
    when m.role in ('owner', 'admin') then 'edit'
    else coalesce(m.permissions -> 'sections' ->> sec, 'edit')
  end
  from public.workspace_members m
  where m.workspace_id = ws and m.user_id = auth.uid()
  limit 1
$$;

create or replace function public.merch_scope(ws uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when not public.workspace_feature_on(ws, 'merch') then 'none'
    when m.role in ('owner', 'admin') or m.permissions ->> 'merch_manager' = 'true' then 'full'
    when m.permissions ->> 'merch_crew' = 'true' then 'crew'
    when coalesce(m.permissions -> 'sections' ->> 'merch', 'edit') <> 'none' then 'full'
    else 'none'
  end
  from public.workspace_members m
  where m.workspace_id = ws and m.user_id = auth.uid()
  limit 1
$$;

-- Only platform admins change features. Any other change to settings keeps the features as they were.
create or replace function public.keep_workspace_features()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.settings -> 'features') is distinct from (old.settings -> 'features') and not public.is_platform_admin() then
    new.settings := (coalesce(new.settings, '{}'::jsonb) - 'features')
      || case when old.settings ? 'features' then jsonb_build_object('features', old.settings -> 'features') else '{}'::jsonb end;
  end if;
  return new;
end $$;
drop trigger if exists keep_workspace_features on public.workspaces;
create trigger keep_workspace_features before update of settings on public.workspaces
  for each row execute function public.keep_workspace_features();

-- The features object for a new workspace: every section, on if it's in the core list.
create or replace function public.core_features_object()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(s, s = any(coalesce((select core_features from public.platform_settings where id = 1), public.all_sections())))
  from unnest(public.all_sections()) s
$$;
-- Only create_workspace uses it (Supabase grants new functions to authenticated by default, so revoke that too).
revoke all on function public.core_features_object() from public, anon, authenticated;

-- New band workspaces start with the core features.
create or replace function public.create_workspace(p_name text, p_type text default 'band', p_kind text default null, p_color text default 'forest')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  clean text := btrim(coalesce(p_name, ''));
  clean_kind text := nullif(btrim(coalesce(p_kind, '')), '');
  ws uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if char_length(clean) < 1 or char_length(clean) > 60 then raise exception 'Name must be 1-60 characters'; end if;
  if p_type <> 'band' then raise exception 'Unsupported workspace type'; end if;
  if clean_kind is not null and char_length(clean_kind) > 30 then raise exception 'Kind must be 30 characters or fewer'; end if;
  if p_color not in ('forest', 'plum', 'ink', 'ocean', 'amber', 'rose') then raise exception 'Unknown colour'; end if;
  if (select count(*) from public.workspaces w where w.owner_id = uid and w.type <> 'personal') >= 10 then
    raise exception 'You have reached the limit of 10 workspaces';
  end if;
  insert into public.workspaces (name, type, owner_id, kind, color, settings)
  values (clean, p_type, uid, clean_kind, p_color, jsonb_build_object('features', public.core_features_object()))
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  return ws;
end $$;

-- ---- Admin panel ---------------------------------------------------------------------------------------------------------
create or replace function public.admin_workspaces()
returns table (
  id uuid, name text, type text, kind text, color text, plan text, status text, created_at timestamptz,
  owner_id uuid, owner_name text, owner_email text, members integer, features jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can see this.'; end if;
  return query
    select w.id, w.name, w.type, w.kind, w.color, w.plan, w.status, w.created_at,
           w.owner_id, p.display_name, u.email::text,
           (select count(*)::integer from public.workspace_members m where m.workspace_id = w.id),
           coalesce(w.settings -> 'features', '{}'::jsonb)
      from public.workspaces w
      left join public.profiles p on p.id = w.owner_id
      left join auth.users u on u.id = w.owner_id
     order by w.type = 'personal', w.created_at desc;
end $$;
revoke all on function public.admin_workspaces() from public, anon;
grant execute on function public.admin_workspaces() to authenticated;

-- Sets one workspace's features. Only known sections, only true/false.
create or replace function public.admin_set_workspace_features(p_workspace uuid, p_features jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  clean jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can change features.'; end if;
  if p_features is null or jsonb_typeof(p_features) <> 'object' then raise exception 'Features must be an object.'; end if;
  select coalesce(jsonb_object_agg(s, coalesce((p_features ->> s)::boolean, true)), '{}'::jsonb) into clean
    from unnest(public.all_sections()) s;
  update public.workspaces
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{features}', clean, true)
   where id = p_workspace;
  if not found then raise exception 'That workspace is no longer there.'; end if;
end $$;
revoke all on function public.admin_set_workspace_features(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_workspace_features(uuid, jsonb) to authenticated;

create or replace function public.admin_set_core_features(p_sections text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only platform admins can change the core features.'; end if;
  if exists (select 1 from unnest(coalesce(p_sections, '{}')) s where not s = any(public.all_sections())) then
    raise exception 'Unknown section.';
  end if;
  update public.platform_settings
     set core_features = (select coalesce(array_agg(distinct s), '{}') from unnest(coalesce(p_sections, '{}')) s),
         updated_at = now(), updated_by = auth.uid()
   where id = 1;
end $$;
revoke all on function public.admin_set_core_features(text[]) from public, anon;
grant execute on function public.admin_set_core_features(text[]) to authenticated;

commit;
