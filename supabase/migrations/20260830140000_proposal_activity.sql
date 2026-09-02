-- The activity log missed the thing people most want to see: who decided what.
--
-- Accepting a proposal is the moment money actually moves, so it belongs in
-- the history alongside the change it caused. And the log has to be live —
-- a shared ledger where only one person's screen updates isn't shared.

alter table public.activity drop constraint activity_kind_check;
alter table public.activity add constraint activity_kind_check check (kind in (
  'group_created', 'member_added', 'member_removed',
  'expense_added', 'expense_edited', 'expense_deleted',
  'settlement_added', 'settlement_undone',
  'proposal_made', 'proposal_accepted', 'proposal_rejected'
));

alter publication supabase_realtime add table public.activity;
