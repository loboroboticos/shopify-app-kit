# Rate limits and cost on the MCP surface

An agent is a client that never gets tired and never reads the invoice. The limits are sized for what an agent
legitimately does and the expensive things are simply not tools.

## Per-token limits sized for reads

Each token gets a sliding window of 60 requests per minute, enforced at the MCP entry point after
authentication and keyed on `tokenId` (not on IP, which an agent behind a proxy shares with everyone). The
limit is sized for an agent that lists and reads to answer a question; a tool that legitimately needs more is a
sign that it should return more per call (pagination with a larger page, a summary tool) rather than that the
limit should rise. Exceeding it returns a 429 with `Retry-After`.

Rule: the limit is one constant read by the entry point; per-tool exceptions do not exist.

## Billed calls need their own budget

A tool that triggers a billed third-party call (image generation, a paid enrichment or lookup, a metered API)
is never exposed as an ordinary MCP tool. At 60 requests per minute an agent loop that retries a "failed"
generation can spend hundreds of dollars in an hour before anyone looks. Such a capability, if it exists at all,
sits behind its own budget: a per-tenant monthly cap stored in the database, decremented in the same
transaction as the call is recorded, refusing with a clear error when exhausted, and reported on the dashboard.

Rule: a PR that adds a tool calling a billed API without a budget row is a review blocker; the manifest's
category column marks `billed` tools so the parity check can require the budget.

## Cheap reversible writes only

Write tools do things that are cheap to do and cheap to undo: set a status, add a note, tag a record, link two
things. They do not delete (see `manifest-parity.md`), do not send email or messages to customers, do not
create charges, and do not call Shopify mutations that cannot be reversed. Anything irreversible stays a
dashboard action with a confirmation, or a `human:account` issue.

Rule: the manifest's `write` flag comes with a `reversibleBy` note naming the tool or dashboard action that
undoes it; a write without one does not pass the parity check.

Sources: app-2 (contributor guide: per-token limits, billed-call incident); app-3 (rebuild plan: reversible writes).
