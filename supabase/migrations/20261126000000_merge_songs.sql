-- Merging duplicate songs, and remembering pairs that only look alike.

-- Pairs someone said are NOT the same song, so the duplicates list stops showing them. song_a < song_b.
create table if not exists public.song_not_duplicates (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  song_a uuid not null references public.songs(id) on delete cascade,
  song_b uuid not null references public.songs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (song_a, song_b),
  check (song_a < song_b)
);
create index if not exists song_not_duplicates_ws_idx on public.song_not_duplicates (workspace_id);

alter table public.song_not_duplicates enable row level security;

create policy ws_read on public.song_not_duplicates for select
  using (section_level(workspace_id, 'songs') <> 'none');
create policy ws_write on public.song_not_duplicates for insert
  with check (
    section_level(workspace_id, 'songs') = 'edit'
    and exists (select 1 from public.songs s where s.id = song_a and s.workspace_id = song_not_duplicates.workspace_id)
    and exists (select 1 from public.songs s where s.id = song_b and s.workspace_id = song_not_duplicates.workspace_id)
  );
create policy ws_delete on public.song_not_duplicates for delete
  using (section_level(workspace_id, 'songs') = 'edit');

-- Folds one song into another: everything that pointed at p_drop (setlist entries, notes, recordings, links,
-- group notes) now points at p_keep, blanks on p_keep are filled from p_drop, and p_drop is deleted.
create or replace function public.merge_songs(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.songs%rowtype;
  d public.songs%rowtype;
begin
  if p_keep = p_drop then raise exception 'Pick two different songs'; end if;
  select * into k from public.songs where id = p_keep for update;
  select * into d from public.songs where id = p_drop for update;
  if k.id is null or d.id is null then raise exception 'Song not found'; end if;
  if k.workspace_id <> d.workspace_id then raise exception 'Songs are in different workspaces'; end if;
  if section_level(k.workspace_id, 'songs') <> 'edit' then raise exception 'You can’t edit songs here'; end if;

  -- A setlist that already has the kept song just loses the copy; the rest are moved over.
  delete from public.setlist_songs s
    where s.song_id = p_drop
      and exists (select 1 from public.setlist_songs x where x.setlist_id = s.setlist_id and x.song_id = p_keep);
  update public.setlist_songs set song_id = p_keep where song_id = p_drop;

  update public.notes set song_id = p_keep where song_id = p_drop;
  update public.recordings set song_id = p_keep where song_id = p_drop;
  update public.song_references set song_id = p_keep where song_id = p_drop;

  delete from public.song_group_notes g
    where g.song_id = p_drop
      and exists (select 1 from public.song_group_notes x where x.group_id = g.group_id and x.song_id = p_keep);
  update public.song_group_notes set song_id = p_keep where song_id = p_drop;

  update public.songs set
    artist = coalesce(nullif(trim(k.artist), ''), d.artist),
    song_key = coalesce(nullif(trim(k.song_key), ''), d.song_key),
    bpm = coalesce(k.bpm, d.bpm),
    chord_chart = case when coalesce(trim(k.chord_chart), '') = '' then d.chord_chart else k.chord_chart end,
    notes = case when coalesce(trim(k.notes), '') = '' then d.notes else k.notes end,
    cover_url = coalesce(k.cover_url, d.cover_url)
  where id = p_keep;

  delete from public.songs where id = p_drop;
end;
$$;

revoke all on function public.merge_songs(uuid, uuid) from public, anon;
grant execute on function public.merge_songs(uuid, uuid) to authenticated;
