# Tabby

**A shared expense ledger that an agent can work in — without ever being
allowed to touch the arithmetic.**

Live: **https://heytabby.vercel.app** · Built for the
[OpenAI WebMCP Challenge](https://webmcp.devpost.com/).

---

## The problem isn't that expense apps are bad

A real restaurant bill is eleven lines across five people, one of whom is
vegetarian, one of whom doesn't drink, and one of whom skipped the dessert.
That's fifty-odd who-had-what decisions, and no interface makes fifty decisions
pleasant. It isn't a design failure — it's what the task *is*.

So Tabby is first an ordinary expense app. Groups, receipts, per-item splits,
balances, settle-up, undo. Every one of those works with a mouse, and often
that's the right tool.

Then it registers its own client-side functions as WebMCP tools, and the
decisions you shouldn't have to make by hand stop being yours.

## The division of labour

> **The model does perception and judgement. The page does the money.**

- **Perception is model work** — reading a crumpled receipt, understanding
  "he didn't eat the lamb", resolving "the taxi on Saturday" to a row.
- **Money is page work** — every allocation, balance and settlement is
  deterministic TypeScript over integer minor units, covered by unit tests
  including randomised conservation checks.

**No write tool accepts a per-person amount.** `assign_items` takes *who had
which item*; the page works out what that costs. An agent cannot make an
arithmetic error here because it is never asked to do arithmetic. That is also
the honest answer to "why not just let the model split it?" — it's your
friends' money, and a language model is the wrong instrument for exact
division.

## What only WebMCP makes possible

Three things in this app cannot be done by an integration that talks to a
backend, because they depend on the agent and the person sharing one live
page.

**A proposal that re-prices itself.** An agent suggests taking someone off the
dishes they didn't eat. While that suggestion is still waiting, you change the
bill by hand. The card recalculates in front of you, and accepting applies what
it says *now* — not what was true when it was written. Elsewhere, advice goes
stale the moment you touch anything.

**An agent that reads its own footprint.** Correct yourself twice in a row and
the second correction folds into the first proposal rather than stacking a
second card on top of it. The agent finds its own pending draft by reading the
page.

**Capability that follows state.** `read_receipt` and `list_receipts` are only
registered once some expense actually has a photo. An agent inspecting the page
before that genuinely cannot see a way to read one. A REST surface is fixed
forever; this one is a function of what's on screen.

## Nothing moves without a person

Every tool that changes what someone owes returns a **proposal**, not a result.
It posts a card with a per-person before/after diff and waits. Accept, decline,
or leave it. `withdraw_proposal` lets an agent take back its own suggestion;
nothing else lets it decide.

Deletes are soft. An expense or a group comes back from undo **as itself** —
same line items, same discussion, same place in the history — rather than as a
copy.

Every change is recorded with its provenance: which items moved, who moved
them, whether a person did it by hand or accepted an agent's suggestion, and
what it did to each person's share. `get_history` hands that back, so "why do I
owe this?" is answerable from the ledger rather than from whatever survives in
a chat window.

## The tool surface — 27 tools

Every tool maps to something a person can already do with a control in the UI,
and calls the same store action the button calls. Nothing here was built for
the agent that wasn't already the app.

**Read** — compact, never the whole ledger
`get_context` · `list_expenses` · `get_balances` · `explain_expense` ·
`who_owes_whom` · `get_history` · `get_insights`

**Navigation** — moves *your* screen, so the agent can point at what it means
`open_group` · `open_view` · `focus_expense`

**Writes** — every one of these proposes and waits
`add_expense` · `itemise_expense` · `assign_items` · `update_expense` ·
`delete_expense` · `settle_up` · `withdraw_proposal` · `create_group` ·
`add_person` · `invite_to_group` · `respond_to_invitation` ·
`delete_group` · `restore_group` · `restore_expense`

**Receipts** — the perception bridge
`attach_receipt` · `list_receipts`* · `read_receipt`*

*\* registered only while an expense carries a photo.*

A receipt photo is unstructured, so the *model* reads it. Money is exact, so
the *page* computes it. The line between model work and page work is whether
the input has a grammar.

## How the tools are registered

`lib/webmcp/useWebMcpTool.ts` — one hook, used by
`lib/webmcp/ToolProvider.tsx` for each tier:

```js
document.modelContext.registerTool({
  name: 'assign_items',
  description: 'Change who had which line items on an expense…',
  inputSchema: { /* JSON Schema */ },
  execute: async (input) => { /* calls the same store action the UI calls */ },
}, { signal: controller.signal })
```

The descriptor is built by `descriptorFor()`, which adds MCP annotations
(`destructiveHint`, `readOnlyHint`) and wraps `execute` so every call is
timed, logged to the on-screen call log, and returned in MCP's
`{ content: [{ type: 'text', text }] }` shape — with `isError` on a throw,
so a failure reaches the agent as something it can read and retry rather
than an exception.

`getModelContext()` prefers `document.modelContext` and falls back to
`navigator.modelContext`, because the property moved during the origin trial
and shipped clients disagree.

Unregistration is the `AbortController` the spec provides. That is what lets
the surface change with the app: abort the controller and those tools are gone
from the agent's view.

## Running it

```bash
npm install
npx supabase start          # local Postgres, auth, storage
cp .env.example .env.local  # fill in the local Supabase keys it prints
npm run dev
```

Then open the app and choose **Try it without an account** for a seeded trip —
five friends, ten expenses, one itemised dinner — with no sign-up.

```bash
npm test          # unit tests: money, splits, settlement, conservation
npm run typecheck
npm run test:e2e  # end-to-end, driving the real tool surface in a browser
```

The e2e suite runs against a local stack by default, or against the deployment
with `TABBY_URL=https://heytabby.vercel.app npm run test:e2e` — which is worth
doing, because latency and rate limits have caught real bugs there that a local
run structurally cannot.

## Architecture

- **Next.js App Router** + TypeScript, React Server Components where they help
- **Supabase** — Postgres with row-level security, auth, realtime, storage.
  Every table is readable only by members of its group; membership itself is
  checked in `SECURITY DEFINER` functions to keep policies from recursing
- **Zustand** for client state; the tools call the same actions the UI does
- **Money as integer minor units** end to end — no floats anywhere near a
  balance
- **WebMCP** via `document.modelContext`, registered from a React provider that
  tears tools down with an `AbortController` when they stop being relevant

## Licence

MIT — see [LICENSE](LICENSE).
