-- Website orders in Rigly.
--
-- The band website sells merch online and pays through PhonePe. Rigly stays the one place stock is counted, so:
--   * the website reads what it can sell from merch_online_stock (stock minus units out in kits not yet approved);
--   * every paid website order is saved here by record_online_order: the order (customer, address, lines), a pending
--     merch sale in the new 'online' mode with the money in the new online_amount column, and the stock moves that
--     take the units off. The sale is approved like any other, which puts the money in Finance;
--   * shipping and cancelling are recorded by set_online_order_status. Cancelling a sale that's still waiting removes
--     it and its stock moves; cancelling one already approved puts the stock back with return moves and leaves the
--     Finance entry for the refund to be taken off by hand.
-- Only the server (service role) calls the functions. Customer details are readable by owners, admins and the Merch
-- role only. Online sales can't be added, changed or deleted by hand. Safe to re-run.

begin;

-- ---- Online sales -----------------------------------------------------------------------------------------------------
alter table public.merch_sales drop constraint if exists merch_sales_mode_check;
alter table public.merch_sales add constraint merch_sales_mode_check check (mode in ('count', 'stall', 'manual', 'online'));
alter table public.merch_sales add column if not exists online_amount numeric(12, 2) not null default 0;
alter table public.merch_sales drop constraint if exists merch_sales_online_amount_check;
alter table public.merch_sales add constraint merch_sales_online_amount_check check (online_amount >= 0);

-- Online sales only come from the website.
drop policy if exists ms_no_online_insert on public.merch_sales;
create policy ms_no_online_insert on public.merch_sales as restrictive for insert to authenticated
  with check (mode <> 'online' and online_amount = 0);
drop policy if exists ms_no_online_update on public.merch_sales;
create policy ms_no_online_update on public.merch_sales as restrictive for update to authenticated
  using (mode <> 'online')
  with check (mode <> 'online' and online_amount = 0);
drop policy if exists ms_no_online_delete on public.merch_sales;
create policy ms_no_online_delete on public.merch_sales as restrictive for delete to authenticated
  using (mode <> 'online');

-- ---- Website orders ---------------------------------------------------------------------------------------------------
create table if not exists public.merch_online_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- The website's order id (also the PhonePe merchant order id).
  website_order_id text not null check (char_length(website_order_id) between 1 and 100),
  sale_id uuid,
  status text not null default 'paid' check (status in ('paid', 'shipped', 'cancelled')),
  customer_name text not null check (char_length(customer_name) <= 200),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 40),
  address text check (address is null or char_length(address) <= 1000),
  city text check (city is null or char_length(city) <= 120),
  state text check (state is null or char_length(state) <= 120),
  pincode text check (pincode is null or char_length(pincode) <= 20),
  -- [{ variant_id, item, label, qty, price }]
  lines jsonb not null default '[]'::jsonb,
  total numeric(12, 2) not null check (total >= 0),
  payment_ref text check (payment_ref is null or char_length(payment_ref) <= 200),
  paid_at timestamptz not null default now(),
  -- More was ordered than Rigly had available when the payment came in.
  stock_short boolean not null default false,
  tracking_number text check (tracking_number is null or char_length(tracking_number) <= 200),
  shipped_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  -- Cancelled after the money was approved: the Finance entry still holds it until someone takes the refund off.
  refund_in_finance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, website_order_id),
  foreign key (sale_id, workspace_id) references public.merch_sales (id, workspace_id) on delete set null (sale_id)
);
create index if not exists merch_online_orders_ws_idx on public.merch_online_orders (workspace_id, paid_at desc);

alter table public.merch_online_orders enable row level security;
drop policy if exists moo_select on public.merch_online_orders;
create policy moo_select on public.merch_online_orders for select to authenticated
  using (public.merch_approver(workspace_id));
-- No insert/update/delete policies: only the server changes orders.

revoke all on public.merch_online_orders from anon;
grant select on public.merch_online_orders to authenticated;
grant select, insert, update, delete on public.merch_online_orders to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'merch_online_orders') then
    alter publication supabase_realtime add table public.merch_online_orders;
  end if;
end $$;

-- ---- What the website can sell ----------------------------------------------------------------------------------------
-- Per live variant: stock on hand, units out in kits not yet approved (an open kit holds what went minus what sold;
-- a closed kit holds what's not back yet), and what's left to sell online.
create or replace function public.merch_online_stock(p_ws uuid)
returns table (item_id uuid, item_name text, item_kind text, variant_id uuid, label text, variant_position double precision, stock integer, in_kits integer, available integer)
language sql stable security definer set search_path = public as $$
  with stock as (
    select m.variant_id, sum(m.qty)::integer as n from public.merch_stock_moves m where m.workspace_id = p_ws group by m.variant_id
  ), kit_sold as (
    select m.kit_id, m.variant_id, sum(-m.qty)::integer as n
      from public.merch_stock_moves m
     where m.workspace_id = p_ws and m.kit_id is not null and m.reason = 'sale'
     group by m.kit_id, m.variant_id
  ), held as (
    select l.variant_id, sum(greatest(l.taken - coalesce(ks.n, 0) - coalesce(l.returned, 0), 0))::integer as n
      from public.merch_kit_lines l
      join public.merch_kits k on k.id = l.kit_id and k.status <> 'approved'
      left join kit_sold ks on ks.kit_id = l.kit_id and ks.variant_id = l.variant_id
     where l.workspace_id = p_ws
     group by l.variant_id
  )
  select i.id, i.name, i.kind, v.id, v.label, v.position,
         coalesce(s.n, 0), coalesce(h.n, 0), greatest(coalesce(s.n, 0) - coalesce(h.n, 0), 0)
    from public.merch_items i
    join public.merch_variants v on v.item_id = i.id and v.archived_at is null
    left join stock s on s.variant_id = v.id
    left join held h on h.variant_id = v.id
   where i.workspace_id = p_ws and i.archived_at is null
   order by i.position, i.name, v.position
$$;
revoke all on function public.merch_online_stock(uuid) from public, anon, authenticated;
grant execute on function public.merch_online_stock(uuid) to service_role;

-- ---- Saving a paid website order --------------------------------------------------------------------------------------
-- p_order: { website_order_id, customer_name, email, phone, address, city, state, pincode, total, payment_ref, paid_at,
--            lines: [{ variant_id, item, label, qty, price }] }
-- p_holder: who's holding the money (the person PhonePe pays out to). Falls back to the workspace owner.
-- Running it again for the same website order changes nothing and returns the order already saved.
create or replace function public.record_online_order(p_ws uuid, p_order jsonb, p_holder uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ext_id text := btrim(coalesce(p_order ->> 'website_order_id', ''));
  existing public.merch_online_orders%rowtype;
  holder uuid;
  sale uuid;
  order_id uuid;
  total numeric := round(coalesce((p_order ->> 'total')::numeric, 0), 2);
  paid timestamptz := coalesce((p_order ->> 'paid_at')::timestamptz, now());
  sale_day date := (coalesce((p_order ->> 'paid_at')::timestamptz, now()) at time zone 'Asia/Kolkata')::date;
  short boolean := false;
  r record;
begin
  if ext_id = '' then raise exception 'The website order id is missing.'; end if;
  if jsonb_typeof(p_order -> 'lines') <> 'array' or jsonb_array_length(p_order -> 'lines') = 0 then
    raise exception 'The order has no items.';
  end if;

  -- One order at a time, so a retry and the first attempt can't both save it.
  perform pg_advisory_xact_lock(hashtext('merch_online_order:' || p_ws::text || ':' || ext_id));
  select * into existing from public.merch_online_orders where workspace_id = p_ws and website_order_id = ext_id;
  if existing.id is not null then
    return jsonb_build_object('order_id', existing.id, 'sale_id', existing.sale_id, 'created', false, 'stock_short', existing.stock_short);
  end if;

  holder := p_holder;
  if holder is null or not exists (select 1 from public.workspace_members m where m.workspace_id = p_ws and m.user_id = holder) then
    select owner_id into holder from public.workspaces where id = p_ws;
  end if;
  if holder is null then raise exception 'No one to hold the money for this workspace.'; end if;

  -- Every line must be a live variant of this workspace, with a whole positive quantity.
  for r in
    select (l ->> 'variant_id')::uuid as variant_id, (l ->> 'qty')::integer as qty
      from jsonb_array_elements(p_order -> 'lines') l
  loop
    if r.qty is null or r.qty <= 0 then raise exception 'Every item needs a quantity.'; end if;
    if not exists (select 1 from public.merch_variants v where v.id = r.variant_id and v.workspace_id = p_ws) then
      raise exception 'An item in the order isn’t in Rigly.';
    end if;
  end loop;

  -- Paid already, so the order is saved even if stock ran out in the meantime; it's flagged for someone to sort out.
  select exists (
    select 1
      from (select (l ->> 'variant_id')::uuid as variant_id, sum((l ->> 'qty')::integer) as qty
              from jsonb_array_elements(p_order -> 'lines') l group by 1) want
      join public.merch_online_stock(p_ws) s on s.variant_id = want.variant_id
     where want.qty > s.available
  ) or exists (
    select 1 from jsonb_array_elements(p_order -> 'lines') l
     where not exists (select 1 from public.merch_online_stock(p_ws) s where s.variant_id = (l ->> 'variant_id')::uuid)
  ) into short;

  insert into public.merch_sales (workspace_id, show_id, date, mode, online_amount, held_by, notes, created_by)
  values (p_ws, null, sale_day, 'online', total, holder,
          left('Website order ' || left(ext_id, 8) || coalesce(' · ' || nullif(btrim(p_order ->> 'customer_name'), ''), ''), 2000),
          holder)
  returning id into sale;

  insert into public.merch_stock_moves (workspace_id, variant_id, qty, reason, unit_price, sale_id, note, date, created_by)
  select p_ws, (l ->> 'variant_id')::uuid, -((l ->> 'qty')::integer), 'sale',
         nullif(l ->> 'price', '')::numeric, sale, left('Website order ' || left(ext_id, 8), 500), sale_day, holder
    from jsonb_array_elements(p_order -> 'lines') l;

  insert into public.merch_online_orders (workspace_id, website_order_id, sale_id, status, customer_name, email, phone,
                                          address, city, state, pincode, lines, total, payment_ref, paid_at, stock_short)
  values (p_ws, ext_id, sale, 'paid',
          left(coalesce(nullif(btrim(p_order ->> 'customer_name'), ''), 'Website customer'), 200),
          left(p_order ->> 'email', 320), left(p_order ->> 'phone', 40), left(p_order ->> 'address', 1000),
          left(p_order ->> 'city', 120), left(p_order ->> 'state', 120), left(p_order ->> 'pincode', 20),
          p_order -> 'lines', total, left(p_order ->> 'payment_ref', 200), paid, short)
  returning id into order_id;

  return jsonb_build_object('order_id', order_id, 'sale_id', sale, 'created', true, 'stock_short', short);
end $$;
revoke all on function public.record_online_order(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.record_online_order(uuid, jsonb, uuid) to service_role;

-- ---- Shipping and cancelling ------------------------------------------------------------------------------------------
-- p_status 'shipped' (with p_tracking) or 'cancelled' (with p_reason). A cancelled order stays cancelled.
create or replace function public.set_online_order_status(p_ws uuid, p_website_order_id text, p_status text, p_tracking text default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.merch_online_orders%rowtype;
  s public.merch_sales%rowtype;
  refund boolean := false;
begin
  if p_status not in ('shipped', 'cancelled') then raise exception 'Unknown order status.'; end if;
  select * into o from public.merch_online_orders where workspace_id = p_ws and website_order_id = p_website_order_id for update;
  if o.id is null then raise exception 'That order isn’t in Rigly.'; end if;

  if o.status = 'cancelled' then
    return jsonb_build_object('status', o.status, 'refund_in_finance', o.refund_in_finance, 'changed', false);
  end if;

  if p_status = 'shipped' then
    update public.merch_online_orders
       set status = 'shipped', tracking_number = left(nullif(btrim(p_tracking), ''), 200),
           shipped_at = coalesce(shipped_at, now()), updated_at = now()
     where id = o.id;
    return jsonb_build_object('status', 'shipped', 'refund_in_finance', false, 'changed', true);
  end if;

  if o.sale_id is not null then
    select * into s from public.merch_sales where id = o.sale_id for update;
  end if;
  if s.id is not null and s.status = 'pending' then
    -- Not approved yet: the sale and its stock moves go, so stock and pending money are as if it never happened.
    update public.merch_online_orders set sale_id = null where id = o.id;
    delete from public.merch_sales where id = s.id;
  elsif s.id is not null then
    -- Money's already in Finance: the units come back, the refund is taken off in Finance by hand.
    insert into public.merch_stock_moves (workspace_id, variant_id, qty, reason, note, date, created_by)
    select p_ws, m.variant_id, -m.qty, 'return', left('Website order ' || left(o.website_order_id, 8) || ' cancelled', 500),
           (now() at time zone 'Asia/Kolkata')::date, s.created_by
      from public.merch_stock_moves m where m.sale_id = s.id and m.reason = 'sale';
    refund := true;
  end if;

  update public.merch_online_orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = left(nullif(btrim(p_reason), ''), 1000),
         refund_in_finance = refund, updated_at = now()
   where id = o.id;
  return jsonb_build_object('status', 'cancelled', 'refund_in_finance', refund, 'changed', true);
end $$;
revoke all on function public.set_online_order_status(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.set_online_order_status(uuid, text, text, text, text) to service_role;

-- ---- Deleting a sale by hand: not for website orders -------------------------------------------------------------------
create or replace function public.delete_merch_sale(p_sale uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.merch_sales%rowtype;
  k public.merch_kits%rowtype;
  taken numeric;
  cut numeric;
  ft_amount numeric;
  split timestamptz;
begin
  select * into s from public.merch_sales where id = p_sale for update;
  if s.id is null then raise exception 'That sale is already gone.'; end if;
  if s.mode = 'online' then raise exception 'This is a website order. Cancel it from Online orders instead.'; end if;
  if s.kit_id is not null then select * into k from public.merch_kits where id = s.kit_id for update; end if;

  if not public.merch_approver(s.workspace_id) then
    if s.status <> 'pending' or s.created_by is distinct from auth.uid() or (k.id is not null and k.status <> 'open') then
      raise exception 'Only an admin or someone with the Merch role can delete this sale.';
    end if;
  end if;

  select split_at into split from public.shows where id = coalesce(s.show_id, k.show_id);
  if split is not null and (s.status = 'approved' or k.status = 'approved') then
    raise exception 'This show’s money has already been split. Undo the split before deleting its sales.';
  end if;

  taken := s.cash_amount + s.upi_amount + s.card_amount;

  if k.id is not null and k.status <> 'open' then
    update public.merch_kits set
      cash_in = greatest(coalesce(cash_in, 0) - s.cash_amount, 0),
      upi_in = greatest(coalesce(upi_in, 0) - s.upi_amount, 0),
      card_in = greatest(coalesce(card_in, 0) - s.card_amount, 0)
    where id = k.id;
  end if;

  if s.finance_transaction_id is not null then
    cut := case when s.kit_id is null then coalesce(s.approved_amount, taken) else taken end;
    select amount into ft_amount from public.finance_transactions where id = s.finance_transaction_id for update;
    if ft_amount is not null then
      if ft_amount - cut <= 0.004 then
        delete from public.finance_transactions where id = s.finance_transaction_id;
      else
        update public.finance_transactions set amount = round(ft_amount - cut, 2) where id = s.finance_transaction_id;
      end if;
    end if;
    if k.id is not null then
      update public.merch_kits set approved_amount = greatest(coalesce(approved_amount, 0) - cut, 0) where id = k.id;
    end if;
  end if;

  delete from public.merch_sales where id = s.id;
end;
$$;
revoke all on function public.delete_merch_sale(uuid) from public, anon;
grant execute on function public.delete_merch_sale(uuid) to authenticated;

-- ---- Approving: online money counts like cash, UPI and card ----------------------------------------------------------
create or replace function public.approve_merch_sales(p_ids uuid[], p_member uuid default null, p_account uuid default null, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  shows_n integer;
  sale_show uuid;
  recorded numeric;
  total numeric;
  last_date date;
  first_holder uuid;
  all_online boolean;
  s_title text;
  s_date date;
  s_split timestamptz;
  holder uuid;
  descr text;
  new_id uuid;
  n integer;
  r record;
  left_over numeric;
  share numeric;
  i integer := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Pick at least one sale to approve.'; end if;
  if p_member is not null and p_account is not null then raise exception 'The money goes to a person or an account, not both.'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'The amount can’t be negative.'; end if;

  perform 1 from public.merch_sales where id = any(p_ids) for update;

  select count(*), min(workspace_id::text)::uuid, count(distinct coalesce(show_id::text, '-'))
    into n, ws, shows_n
    from public.merch_sales where id = any(p_ids);
  if n <> cardinality(p_ids) then raise exception 'Some of those sales are no longer there.'; end if;
  if (select count(distinct workspace_id) from public.merch_sales where id = any(p_ids)) <> 1 then raise exception 'Those sales are from different workspaces.'; end if;
  if not public.merch_approver(ws) then raise exception 'Only an admin or someone with the Merch role can approve merch takings.'; end if;
  if exists (select 1 from public.merch_sales where id = any(p_ids) and kit_id is not null) then raise exception 'Kit sales are approved with their kit.'; end if;
  if exists (select 1 from public.merch_sales where id = any(p_ids) and status <> 'pending') then raise exception 'Some of those sales are already approved.'; end if;
  if shows_n <> 1 then raise exception 'Approve one show’s sales at a time.'; end if;

  select min(show_id::text)::uuid, coalesce(sum(cash_amount + upi_amount + card_amount + online_amount), 0), max(date), bool_and(mode = 'online')
    into sale_show, recorded, last_date, all_online
    from public.merch_sales where id = any(p_ids);
  total := round(coalesce(p_amount, recorded), 2);
  select held_by into first_holder from public.merch_sales where id = any(p_ids) and held_by is not null order by date, created_at limit 1;

  if p_member is not null and not exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = p_member) then
    raise exception 'That person isn’t in this workspace.';
  end if;
  if p_account is not null and not exists (select 1 from public.finance_accounts a where a.id = p_account and a.workspace_id = ws and a.archived_at is null) then
    raise exception 'That account isn’t available.';
  end if;

  if total > 0 then
    if sale_show is not null then
      select title, show_date, split_at into s_title, s_date, s_split from public.shows where id = sale_show;
    end if;
    holder := case when p_account is null then coalesce(p_member, first_holder, auth.uid()) end;
    if holder is not null and not exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = holder) then
      holder := auth.uid();
    end if;
    descr := left(case when all_online then 'Website merch orders' else 'Merch sales' || coalesce(' at ' || s_title, '') end
                  || case when total <> recorded then ' (adjusted from ' || trim(to_char(recorded, 'FM999999999990.00')) || ')' else '' end, 300);

    insert into public.finance_transactions (workspace_id, member_id, account_id, amount, description, category, show_id, date, recorded_by)
    values (ws, holder, p_account, total, descr, 'merch',
            null,
            coalesce(s_date, last_date, current_date), auth.uid())
    returning id into new_id;
  end if;

  left_over := total;
  for r in select id, cash_amount + upi_amount + card_amount + online_amount as amt from public.merch_sales where id = any(p_ids) order by date, created_at loop
    i := i + 1;
    if i = n then share := left_over;
    elsif recorded > 0 then share := round(total * r.amt / recorded, 2);
    else share := case when i = 1 then total else 0 end;
    end if;
    share := greatest(least(share, left_over), 0);
    left_over := left_over - share;
    update public.merch_sales
       set status = 'approved', approved_by = auth.uid(), approved_at = now(), finance_transaction_id = new_id, approved_amount = share
     where id = r.id;
  end loop;

  return new_id;
end $$;
revoke all on function public.approve_merch_sales(uuid[], uuid, uuid, numeric) from public, anon;
grant execute on function public.approve_merch_sales(uuid[], uuid, uuid, numeric) to authenticated;

commit;
