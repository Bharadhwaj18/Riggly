-- Song tags (language, style, male/female and so on) and show types, so a setlist can suggest songs that fit.

alter table public.songs add column if not exists tags text[] not null default '{}';
create index if not exists songs_tags_idx on public.songs using gin (tags);

-- A kind of show your band plays (Corporate, College, Wedding…) and the song tags that fit it.
create table if not exists public.show_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists show_types_ws_name_idx on public.show_types (workspace_id, lower(name));

alter table public.show_types enable row level security;
create policy ws_read on public.show_types for select
  using (section_level(workspace_id, 'setlists') <> 'none');
create policy ws_insert on public.show_types for insert
  with check (section_level(workspace_id, 'setlists') = 'edit');
create policy ws_update on public.show_types for update
  using (section_level(workspace_id, 'setlists') = 'edit')
  with check (section_level(workspace_id, 'setlists') = 'edit');
create policy ws_delete on public.show_types for delete
  using (section_level(workspace_id, 'setlists') = 'edit');

alter table public.setlists add column if not exists show_type_id uuid references public.show_types(id) on delete set null;
