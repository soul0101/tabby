-- ── What actually changed ────────────────────────────────────────────────
--
-- The log said "Changed who had 1 item on Thalassa · Sunday lunch" and left
-- it there. Clicking the entry took you to the expense as it stands now, which
-- answers a different question from the one you asked: not "what does this
-- look like" but "what did this person do, and what did it cost people".
--
-- So each entry can now carry the change itself — which items moved, who came
-- on and off each one, what it did to everyone's share, and whether a person
-- did it by hand or an agent proposed it and somebody accepted. Kept as jsonb
-- because the shape differs per kind and none of it is queried, only shown.
--
-- This is also what makes the ledger worth reading back: an agent asking
-- "why does Ravi owe this" gets the history that produced the number, not
-- just the number.

alter table public.activity
  add column detail jsonb not null default '{}'::jsonb;

comment on column public.activity.detail is
  'What changed, for display and for an agent reading back the history. '
  'Shape depends on kind; see lib/types.ts ActivityDetail.';
