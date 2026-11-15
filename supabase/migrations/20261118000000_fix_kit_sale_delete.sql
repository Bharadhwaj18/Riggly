-- Fix: crew (and admins) couldn't record sales from a kit, or close one.
--
-- Supabase refuses a DELETE with no WHERE clause on requests that come through the API (a safety guard), and
-- record_kit_sale / close_merch_kit each cleared their scratch list with a bare "delete from _kit_...;".
-- Every sale failed with "DELETE requires a WHERE clause". The only change here is "where true" on those two
-- lines; everything else is exactly as in 20261115000000_merch_kits_and_crew.sql.
-- No new tables. Safe to re-run.

begin;

create or replace function public.record_kit_sale(p_kit uuid, p_lines jsonb, p_cash numeric default 0, p_upi numeric default 0, p_card numeric default 0, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  k public.merch_kits%rowtype;
  s_date date;
  sale_id uuid;
  r record;
  left_n integer;
  units integer := 0;
begin
  select * into k from public.merch_kits where id = p_kit for update;
  if k.id is null then raise exception 'That kit is no longer there.'; end if;
  if not (public.merch_kit_mine(k.id) or public.merch_can_edit(k.workspace_id)) then raise exception 'You aren’t on this kit.'; end if;
  if public.workspace_access(k.workspace_id) <> 'full' then raise exception 'This workspace is read-only.'; end if;
  if k.status <> 'open' then raise exception 'This kit is closed. Ask an admin to reopen it.'; end if;
  if coalesce(p_cash, 0) < 0 or coalesce(p_upi, 0) < 0 or coalesce(p_card, 0) < 0 then raise exception 'Amounts can’t be negative.'; end if;

  create temp table if not exists _kit_sale_lines (variant_id uuid primary key, qty integer) on commit drop;
  delete from _kit_sale_lines where true;
  insert into _kit_sale_lines
    select (e ->> 'variant_id')::uuid, sum((e ->> 'qty')::integer)
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
     where coalesce((e ->> 'qty')::integer, 0) > 0
     group by 1;

  for r in select x.variant_id, x.qty, l.taken from _kit_sale_lines x left join public.merch_kit_lines l on l.kit_id = k.id and l.variant_id = x.variant_id loop
    if r.taken is null then raise exception 'One of those items isn’t in this kit.'; end if;
    select r.taken - coalesce(sum(-m.qty), 0) into left_n from public.merch_stock_moves m where m.kit_id = k.id and m.variant_id = r.variant_id and m.reason = 'sale';
    if r.qty > left_n then raise exception 'Only % of one of those items left in the kit.', greatest(left_n, 0); end if;
    units := units + r.qty;
  end loop;
  if units = 0 and coalesce(p_cash, 0) + coalesce(p_upi, 0) + coalesce(p_card, 0) = 0 then raise exception 'Add what was sold.'; end if;

  select show_date into s_date from public.shows where id = k.show_id;
  insert into public.merch_sales (workspace_id, show_id, kit_id, date, mode, cash_amount, upi_amount, card_amount, held_by, notes)
  values (k.workspace_id, k.show_id, k.id, coalesce(s_date, current_date), 'stall', coalesce(p_cash, 0), coalesce(p_upi, 0), coalesce(p_card, 0), auth.uid(), left(nullif(btrim(p_notes), ''), 2000))
  returning id into sale_id;

  insert into public.merch_stock_moves (workspace_id, variant_id, qty, reason, unit_price, show_id, sale_id, kit_id, date)
  select k.workspace_id, x.variant_id, -x.qty, 'sale', coalesce(l.price, v.price, i.price), k.show_id, sale_id, k.id, coalesce(s_date, current_date)
    from _kit_sale_lines x
    join public.merch_kit_lines l on l.kit_id = k.id and l.variant_id = x.variant_id
    join public.merch_variants v on v.id = x.variant_id
    join public.merch_items i on i.id = v.item_id;

  return sale_id;
end $$;
revoke all on function public.record_kit_sale(uuid, jsonb, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.record_kit_sale(uuid, jsonb, numeric, numeric, numeric, text) to authenticated;

create or replace function public.close_merch_kit(p_kit uuid, p_counts jsonb, p_cash numeric, p_upi numeric, p_card numeric, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  k public.merch_kits%rowtype;
  s_date date;
  r record;
  c jsonb;
  tapped integer;
  rest integer;
  count_sale uuid;
  t_cash numeric; t_upi numeric; t_card numeric;
begin
  select * into k from public.merch_kits where id = p_kit for update;
  if k.id is null then raise exception 'That kit is no longer there.'; end if;
  if not (public.merch_kit_mine(k.id) or public.merch_can_edit(k.workspace_id)) then raise exception 'You aren’t on this kit.'; end if;
  if k.status <> 'open' then raise exception 'This kit is already closed.'; end if;
  if coalesce(p_cash, 0) < 0 or coalesce(p_upi, 0) < 0 or coalesce(p_card, 0) < 0 then raise exception 'Amounts can’t be negative.'; end if;
  select show_date into s_date from public.shows where id = k.show_id;

  create temp table if not exists _kit_close (variant_id uuid primary key, sold integer) on commit drop;
  delete from _kit_close where true;

  for r in select * from public.merch_kit_lines where kit_id = k.id loop
    select e into c from jsonb_array_elements(coalesce(p_counts, '[]'::jsonb)) e where (e ->> 'variant_id')::uuid = r.variant_id limit 1;
    if c is null or c ->> 'returned' is null then raise exception 'Count how many came back of every item.'; end if;
    if (c ->> 'returned')::integer < 0 or coalesce((c ->> 'given')::integer, 0) < 0 or coalesce((c ->> 'lost')::integer, 0) < 0 then
      raise exception 'Counts can’t be negative.';
    end if;
    select coalesce(sum(-m.qty), 0) into tapped from public.merch_stock_moves m where m.kit_id = k.id and m.variant_id = r.variant_id and m.reason = 'sale';
    rest := r.taken - tapped - (c ->> 'returned')::integer - coalesce((c ->> 'given')::integer, 0) - coalesce((c ->> 'lost')::integer, 0);
    if rest < 0 then raise exception 'More counted than went out for one of the items (% went, % already sold).', r.taken, tapped; end if;
    update public.merch_kit_lines
       set returned = (c ->> 'returned')::integer, given = coalesce((c ->> 'given')::integer, 0), lost = coalesce((c ->> 'lost')::integer, 0)
     where kit_id = k.id and variant_id = r.variant_id;
    if rest > 0 then insert into _kit_close values (r.variant_id, rest); end if;
  end loop;

  select coalesce(sum(cash_amount), 0), coalesce(sum(upi_amount), 0), coalesce(sum(card_amount), 0)
    into t_cash, t_upi, t_card from public.merch_sales where kit_id = k.id;

  if exists (select 1 from _kit_close) or greatest(coalesce(p_cash, 0) - t_cash, 0) + greatest(coalesce(p_upi, 0) - t_upi, 0) + greatest(coalesce(p_card, 0) - t_card, 0) > 0 then
    insert into public.merch_sales (workspace_id, show_id, kit_id, date, mode, cash_amount, upi_amount, card_amount, held_by, notes)
    values (k.workspace_id, k.show_id, k.id, coalesce(s_date, current_date), 'count',
            greatest(coalesce(p_cash, 0) - t_cash, 0), greatest(coalesce(p_upi, 0) - t_upi, 0), greatest(coalesce(p_card, 0) - t_card, 0),
            auth.uid(), 'Counted at close')
    returning id into count_sale;
    insert into public.merch_stock_moves (workspace_id, variant_id, qty, reason, unit_price, show_id, sale_id, kit_id, date)
    select k.workspace_id, x.variant_id, -x.sold, 'sale', coalesce(l.price, v.price, i.price), k.show_id, count_sale, k.id, coalesce(s_date, current_date)
      from _kit_close x
      join public.merch_kit_lines l on l.kit_id = k.id and l.variant_id = x.variant_id
      join public.merch_variants v on v.id = x.variant_id
      join public.merch_items i on i.id = v.item_id;
  end if;

  update public.merch_kits
     set status = 'closed', cash_in = coalesce(p_cash, 0), upi_in = coalesce(p_upi, 0), card_in = coalesce(p_card, 0),
         close_notes = left(nullif(btrim(p_notes), ''), 2000), closed_by = auth.uid(), closed_at = now()
   where id = k.id;
end $$;
revoke all on function public.close_merch_kit(uuid, jsonb, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.close_merch_kit(uuid, jsonb, numeric, numeric, numeric, text) to authenticated;

commit;
