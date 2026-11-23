-- Demo bands show only the core features (the list in the admin panel), not every section.
-- The admin panel can still switch more on for any demo. Existing demos are brought into line.
-- Safe to re-run.

begin;

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
          jsonb_build_object('demo', true, 'features', public.core_features_object()))
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

-- Demos made so far had everything on. The features guard only lets platform admins change features from the app,
-- so step around it for this one fix.
alter table public.workspaces disable trigger keep_workspace_features;
update public.workspaces
   set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{features}', public.core_features_object(), true)
 where (settings ->> 'demo')::boolean is true;
alter table public.workspaces enable trigger keep_workspace_features;

commit;
