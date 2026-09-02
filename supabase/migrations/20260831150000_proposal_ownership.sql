-- Three things learned from watching a real agent work.
--
-- 1. An agent could see what a draft *said* but not what it would *do* to the
--    bill, so it reasoned against the saved state and concluded its own
--    correction was a no-op. That's a read-side fix, but it needs the draft
--    to be findable per person, hence the index below.
--
-- 2. A draft belongs to whoever proposed it. Folding Ravi's suggestion into
--    Arjun's draft would let one person silently edit another's proposal and
--    leave Arjun's name on it.
--
-- 3. An agent should be able to take its own suggestion back rather than
--    asking the group to decline something it no longer means.
alter type public.proposal_status add value if not exists 'withdrawn';

create index if not exists messages_open_draft_idx
  on public.messages (group_id, author_member)
  where kind = 'proposal' and status = 'pending';
