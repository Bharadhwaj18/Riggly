-- Correct a sale made at the stall: the amount taken and how it was paid.
--
-- Crew can't write to merch_sales directly (they only see and change their own kits through functions), so this is
-- the one way to fix a mistyped amount or a wrong payment method before the kit is closed. Only for sales tapped at
-- the stall, while the kit is open and the sale is still waiting for approval. Items and stock aren't touched;
-- to change what was sold, undo the sale and record it again.
-- No new tables. Safe to re-run.

begin;

create or replace function public.update_kit_sale(p_sale uuid, p_amount numeric, p_method text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.merch_sales%rowtype;
begin
  select * into s from public.merch_sales where id = p_sale for update;
  if s.id is null or s.kit_id is null then raise exception 'That sale is no longer there.'; end if;
  if not (public.merch_kit_mine(s.kit_id) or public.merch_can_edit(s.workspace_id)) then raise exception 'You aren’t on this kit.'; end if;
  if public.workspace_access(s.workspace_id) <> 'full' then raise exception 'This workspace is read-only.'; end if;
  if public.merch_kit_status(s.kit_id) <> 'open' or s.status <> 'pending' then raise exception 'This kit is closed. Ask an admin to reopen it.'; end if;
  if s.mode <> 'stall' then raise exception 'Only sales made at the stall can be changed here.'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Enter an amount of 0 or more.'; end if;
  if p_method not in ('cash', 'upi', 'card') then raise exception 'Pick cash, UPI or card.'; end if;

  update public.merch_sales
     set cash_amount = case when p_method = 'cash' then round(p_amount, 2) else 0 end,
         upi_amount  = case when p_method = 'upi'  then round(p_amount, 2) else 0 end,
         card_amount = case when p_method = 'card' then round(p_amount, 2) else 0 end
   where id = s.id;
end $$;
revoke all on function public.update_kit_sale(uuid, numeric, text) from public, anon;
grant execute on function public.update_kit_sale(uuid, numeric, text) to authenticated;

commit;
