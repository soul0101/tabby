-- History entries should take you to the thing they're about.
--
-- Nulls out rather than cascading: when an expense is deleted the record of
-- deleting it must survive, it just stops being a link.
alter table public.activity
  add column if not exists expense_id uuid references public.expenses(id) on delete set null;

create index if not exists activity_expense_idx
  on public.activity (expense_id) where expense_id is not null;
