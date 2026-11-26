-- The app is called Riggly now. Three functions still said "Rigly" in their messages
-- (create_demo_workspace, record_online_order, set_online_order_status), and so does the
-- description of any demo workspace already made. Each function is re-created from its own
-- current definition with only the name swapped, so nothing else about it changes.

do $$
declare r record;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc like '%Rigly%'
  loop
    execute replace(pg_get_functiondef(r.oid), 'Rigly', 'Riggly');
  end loop;
end $$;

update public.workspaces set description = replace(description, 'Rigly', 'Riggly') where description like '%Rigly%';
