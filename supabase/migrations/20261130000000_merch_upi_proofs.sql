-- Photos of UPI payments for merch sales. Screenshots show names and phone numbers, so they're private: only the
-- person who took them and the workspace's merch approvers can see them.
--
--   bucket merch-payment-proofs   objects at {workspace_id}/{user_id}/{file}
--   table  merch_payment_proofs   one row per photo, tied to the sale it proves

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merch-payment-proofs', 'merch-payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- Anyone who can sell merch (crew included) uploads into their own folder in the workspace.
drop policy if exists merch_proof_insert on storage.objects;
create policy merch_proof_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'merch-payment-proofs'
    and (storage.foldername(name))[2] = auth.uid()::text
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then public.merch_scope(((storage.foldername(name))[1])::uuid) <> 'none' else false end
  );

-- Seen by whoever took it and by the approvers.
drop policy if exists merch_proof_select on storage.objects;
create policy merch_proof_select on storage.objects for select to authenticated
  using (
    bucket_id = 'merch-payment-proofs'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.merch_approver(((storage.foldername(name))[1])::uuid) else false end
    )
  );

drop policy if exists merch_proof_delete on storage.objects;
create policy merch_proof_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'merch-payment-proofs'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.merch_approver(((storage.foldername(name))[1])::uuid) else false end
    )
  );

create table if not exists public.merch_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sale_id uuid not null references public.merch_sales(id) on delete cascade,
  file_path text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists merch_payment_proofs_sale_idx on public.merch_payment_proofs (sale_id);
create index if not exists merch_payment_proofs_ws_idx on public.merch_payment_proofs (workspace_id);

-- Crew can't read merch_sales directly, so the insert rule asks this instead: is it a sale I recorded, in this workspace?
create or replace function public.merch_sale_is_mine(p_sale uuid, p_ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.merch_sales s where s.id = p_sale and s.workspace_id = p_ws and s.created_by = auth.uid());
$$;
revoke all on function public.merch_sale_is_mine(uuid, uuid) from public, anon;
grant execute on function public.merch_sale_is_mine(uuid, uuid) to authenticated;

alter table public.merch_payment_proofs enable row level security;

create policy proof_read on public.merch_payment_proofs for select
  using (created_by = auth.uid() or public.merch_approver(workspace_id));
create policy proof_insert on public.merch_payment_proofs for insert
  with check (
    created_by = auth.uid()
    and file_path like workspace_id::text || '/' || auth.uid()::text || '/%'
    and public.merch_sale_is_mine(sale_id, workspace_id)
  );
create policy proof_delete on public.merch_payment_proofs for delete
  using (created_by = auth.uid() or public.merch_approver(workspace_id));
