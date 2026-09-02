-- A pending proposal is a draft you can keep editing, not a fixed suggestion.
--
-- Asking an agent to adjust its own suggestion used to replace it, losing the
-- work: "take Meera off the non-veg" then "but she had the mutton" ended up
-- proposing only the second, computed against a bill where the first had never
-- happened — so it changed nothing. A revision now amends the draft, and each
-- thing the agent said is kept so the reasoning stays readable.
alter table public.messages
  add column if not exists revisions jsonb not null default '[]'::jsonb;

comment on column public.messages.revisions is
  'Each thing the agent said while building this draft: [{ body, at }].';
