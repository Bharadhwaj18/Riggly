-- Deleting any merch sale, approved or not, in one safe step:
--   * its stock goes back (its stock moves are deleted with it) and its UPI photo rows go too;
--   * a closed or approved kit's handed-in money drops by what the sale took;
--   * money already in Finance comes off that income entry, or the entry is removed when nothing's left.
-- Approvers (admins and the Merch role) can delete any sale. Anyone else only their own sale that's still waiting,
-- and not one in a kit that's been closed. A show whose money was already split is left alone.

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

  -- A kit that's been counted: this sale's money is no longer part of what was handed in.
  if k.id is not null and k.status <> 'open' then
    update public.merch_kits set
      cash_in = greatest(coalesce(cash_in, 0) - s.cash_amount, 0),
      upi_in = greatest(coalesce(upi_in, 0) - s.upi_amount, 0),
      card_in = greatest(coalesce(card_in, 0) - s.card_amount, 0)
    where id = k.id;
  end if;

  -- Money already in Finance: take this sale's share off the income entry.
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
