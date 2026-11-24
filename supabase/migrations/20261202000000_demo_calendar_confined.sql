-- A demo band keeps to itself: its shows, events and time off no longer show as busy blocks in your other
-- workspaces' calendars (where your bandmates could see them), and nothing from real workspaces shows inside a demo.
create or replace function public.calendar_external(p_ws uuid)
 returns table(kind text, item_id uuid, member_id uuid, source_name text, start_date date, end_date date, visibility text, title text, detail text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_ws) then
    return;
  end if;
  -- Inside a demo band: nothing from anywhere else.
  if exists (select 1 from public.workspaces w where w.id = p_ws and w.settings -> 'demo' = 'true'::jsonb) then
    return;
  end if;

  return query
  with shared as (
    select other.user_id, other.workspace_id as src
    from public.workspace_members here
    join public.workspace_members other
      on other.user_id = here.user_id and other.workspace_id <> p_ws
    join public.workspaces ow on ow.id = other.workspace_id
    where here.workspace_id = p_ws
      and public.workspace_access(other.workspace_id) <> 'none'
      and coalesce(ow.settings -> 'demo', 'false'::jsonb) <> 'true'::jsonb
  )
  select 'show'::text, s.id, sh.user_id,
         case when s.visibility = 'details' then w.name end,
         s.show_date::date, s.show_date::date, s.visibility,
         case when s.visibility = 'details' then s.title end,
         case when s.visibility = 'details' then s.venue end
  from shared sh
  join public.shows s on s.workspace_id = sh.src
  join public.workspaces w on w.id = sh.src
  where s.visibility <> 'hidden' and s.show_date is not null
  union all
  select 'event'::text, e.id, sh.user_id,
         case when e.visibility = 'details' then w.name end,
         e.start_date::date, e.end_date::date, e.visibility,
         case when e.visibility = 'details' then e.title end,
         case when e.visibility = 'details' then e.notes end
  from shared sh
  join public.calendar_events e on e.workspace_id = sh.src
  join public.workspaces w on w.id = sh.src
  where e.visibility <> 'hidden'
  union all
  select 'unavailable'::text, u.id, u.member_id,
         case when u.visibility = 'details' then w.name end,
         u.start_date::date, u.end_date::date, u.visibility,
         null::text,
         case when u.visibility = 'details' then u.reason end
  from shared sh
  join public.unavailability u on u.workspace_id = sh.src and u.member_id = sh.user_id
  join public.workspaces w on w.id = sh.src
  where u.visibility <> 'hidden';
end;
$function$;
