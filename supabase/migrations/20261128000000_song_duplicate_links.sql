-- Songs someone marked by hand as copies of each other, for the ones the title matching misses.
-- song_a < song_b. They show up on the Possible duplicates page like any other group.

create table if not exists public.song_duplicate_links (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  song_a uuid not null references public.songs(id) on delete cascade,
  song_b uuid not null references public.songs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (song_a, song_b),
  check (song_a < song_b)
);
create index if not exists song_duplicate_links_ws_idx on public.song_duplicate_links (workspace_id);

alter table public.song_duplicate_links enable row level security;

create policy ws_read on public.song_duplicate_links for select
  using (section_level(workspace_id, 'songs') <> 'none');
create policy ws_write on public.song_duplicate_links for insert
  with check (
    section_level(workspace_id, 'songs') = 'edit'
    and exists (select 1 from public.songs s where s.id = song_a and s.workspace_id = song_duplicate_links.workspace_id)
    and exists (select 1 from public.songs s where s.id = song_b and s.workspace_id = song_duplicate_links.workspace_id)
  );
create policy ws_delete on public.song_duplicate_links for delete
  using (section_level(workspace_id, 'songs') = 'edit');
