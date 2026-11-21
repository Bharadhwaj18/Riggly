-- Approving merch takings into Finance can use an edited amount.
--
-- The amount defaults to what was handed in (a kit) or recorded (direct sales), but the approver can change it,
-- for payments that were missed or not accounted for. The Finance entry uses the approved amount and says what it
-- was adjusted from. The approved amount is kept on the kit / sales too, so Merch reports match Finance.
--
--   approve_merch_kit(kit, member, account, amount)     amount null = the money handed in
--   approve_merch_sales(ids, member, account, amount)   amount null = the sales' total
--
-- The old three-argument versions are replaced (calls without an amount keep working). Safe to re-run.

begin;

alter table public.merch_kits add column if not exists approved_amount numeric(12, 2) check (approved_amount is null or approved_amount >= 0);
alter table public.merch_sales add column if not exists approved_amount numeric(12, 2) check (approved_amount is null or approved_amount >= 0);

drop function if exists public.approve_merch_kit(uuid, uuid, uuid);
drop function if exists public.approve_merch_sales(uuid[], uuid, uuid);

-- ---- Approving a kit -------------------------------------------------------------------------------------------------
-- One Finance income entry for the approved amount, giveaways and losses taken off stock, and the kit locked.
create or replace function public.approve_merch_kit(p_kit uuid, p_member uuid default null, p_account uuid default null, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  k public.merch_kits%rowtype;
  s_title text; s_date date; s_split timestamptz;
  handed numeric;
  total numeric;
  holder uuid;
  new_id uuid;
begin
  select * into k from public.merch_kits where id = p_kit for update;
  if k.id is null then raise exception 'That kit is no longer there.'; end if;
  if not public.merch_approver(k.workspace_id) then raise exception 'Only an admin or someone with the Merch role can approve merch takings.'; end if;
  if k.status <> 'closed' then raise exception 'Close the kit before approving it.'; end if;
  if p_member is not null and p_account is not null then raise exception 'The money goes to a person or an account, not both.'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'The amount can’t be negative.'; end if;
  if p_member is not null and not exists (select 1 from public.workspace_members m where m.workspace_id = k.workspace_id and m.user_id = p_member) then
    raise exception 'That person isn’t in this workspace.';
  end if;
  if p_account is not null and not exists (select 1 from public.finance_accounts a where a.id = p_account and a.workspace_id = k.workspace_id and a.archived_at is null) then
    raise exception 'That account isn’t available.';
  end if;

  select title, show_date, split_at into s_title, s_date, s_split from public.shows where id = k.show_id;
  handed := coalesce(k.cash_in, 0) + coalesce(k.upi_in, 0) + coalesce(k.card_in, 0);
  total := round(coalesce(p_amount, handed), 2);

  if total > 0 then
    holder := case when p_account is null then coalesce(p_member, k.lead_id, auth.uid()) end;
    if holder is not null and not exists (select 1 from public.workspace_members m where m.workspace_id = k.workspace_id and m.user_id = holder) then
      holder := auth.uid();
    end if;
    insert into public.finance_transactions (workspace_id, member_id, account_id, amount, description, category, show_id, date, recorded_by)
    values (k.workspace_id, holder, p_account, total,
            left('Merch sales at ' || coalesce(s_title, 'a show')
                 || case when total <> handed then ' (adjusted from ' || trim(to_char(handed, 'FM999999999990.00')) || ')' else '' end
                 || case when s_split is not null then ' (show already split)' else '' end, 300),
            'merch', case when s_split is null then k.show_id end, coalesce(s_date, current_date), auth.uid())
    returning id into new_id;
  end if;

  insert into public.merch_stock_moves (workspace_id, variant_id, qty, reason, show_id, kit_id, note, date)
  select k.workspace_id, l.variant_id, -l.given, 'giveaway', k.show_id, k.id, 'Given away at the show', coalesce(s_date, current_date)
    from public.merch_kit_lines l where l.kit_id = k.id and l.given > 0;
  insert into public.merch_stock_moves (workspace_id, variant_id, qty, reason, show_id, kit_id, note, date)
  select k.workspace_id, l.variant_id, -l.lost, 'damaged', k.show_id, k.id, 'Missing after the show', coalesce(s_date, current_date)
    from public.merch_kit_lines l where l.kit_id = k.id and l.lost > 0;

  update public.merch_sales set status = 'approved', approved_by = auth.uid(), approved_at = now(), finance_transaction_id = new_id where kit_id = k.id;
  update public.merch_kits set status = 'approved', approved_by = auth.uid(), approved_at = now(), finance_transaction_id = new_id, approved_amount = total where id = k.id;
  return new_id;
end $$;
revoke all on function public.approve_merch_kit(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.approve_merch_kit(uuid, uuid, uuid, numeric) to authenticated;

-- ---- Approving sales made without a kit --------------------------------------------------------------------------------
-- One show's sales together, one Finance entry for the approved amount. Kit sales are approved with their kit.
-- Each sale keeps its share of the approved amount (in proportion to what it recorded), so reports add up.
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

  select min(show_id::text)::uuid, coalesce(sum(cash_amount + upi_amount + card_amount), 0), max(date)
    into sale_show, recorded, last_date
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
    descr := left('Merch sales' || coalesce(' at ' || s_title, '')
                  || case when total <> recorded then ' (adjusted from ' || trim(to_char(recorded, 'FM999999999990.00')) || ')' else '' end
                  || case when s_split is not null then ' (show already split)' else '' end, 300);

    insert into public.finance_transactions (workspace_id, member_id, account_id, amount, description, category, show_id, date, recorded_by)
    values (ws, holder, p_account, total, descr, 'merch',
            case when s_split is null then sale_show end,
            coalesce(s_date, last_date, current_date), auth.uid())
    returning id into new_id;
  end if;

  -- Each sale's share of the approved amount; the last one takes whatever rounding left over.
  left_over := total;
  for r in select id, cash_amount + upi_amount + card_amount as amt from public.merch_sales where id = any(p_ids) order by date, created_at loop
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
