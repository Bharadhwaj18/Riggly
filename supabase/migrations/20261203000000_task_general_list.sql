-- Every workspace gets one General list: tasks added without picking a list go there. It can't be deleted or renamed
-- (the app enforces that). An existing list already called "General" becomes it, so nothing is duplicated.
alter table public.task_boards add column if not exists is_general boolean not null default false;
create unique index if not exists task_boards_one_general on public.task_boards (workspace_id) where is_general;

-- A list already named General (the oldest one, if there are several) becomes the General list.
update public.task_boards b set is_general = true
where b.id in (
  select distinct on (workspace_id) id from public.task_boards
  where lower(btrim(name)) = 'general' and archived_at is null
  order by workspace_id, created_at
)
and not exists (select 1 from public.task_boards g where g.workspace_id = b.workspace_id and g.is_general);

-- Every other workspace gets a fresh one, with the usual three buckets behind the scenes.
with made as (
  insert into public.task_boards (workspace_id, name, created_by, is_general)
  select w.id, 'General', w.owner_id, true
  from public.workspaces w
  where not exists (select 1 from public.task_boards g where g.workspace_id = w.id and g.is_general)
  returning id, workspace_id
)
insert into public.task_buckets (workspace_id, board_id, name, position)
select m.workspace_id, m.id, b.name, b.position
from made m
cross join (values ('To do', 1), ('In progress', 2), ('Done', 3)) as b(name, position);

-- A list renamed to General earlier may have no buckets; give it the usual three.
insert into public.task_buckets (workspace_id, board_id, name, position)
select g.workspace_id, g.id, b.name, b.position
from public.task_boards g
cross join (values ('To do', 1), ('In progress', 2), ('Done', 3)) as b(name, position)
where g.is_general and not exists (select 1 from public.task_buckets x where x.board_id = g.id);
