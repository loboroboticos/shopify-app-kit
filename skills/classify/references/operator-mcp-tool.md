# The operator MCP classify tool

The cheapest way to put classification into production is a tool on the app's own operator MCP server, because
that surface already carries every guard a billed classifier needs. See `mcp-connector` for the surface; this is
the one tool shape.

## A billed, budgeted, role-scoped tool

An operator's agent hands the tool a batch of records it fetched — orders to route, tickets to triage, a
moderation queue to clear — and gets back a typed label and a confidence per record, acting on the confident ones
and leaving the rest. The tool:

- reads `{ userId, roleLevel, tokenId }` from context and calls `assertRole(n)` first, like every MCP tool;
- is a read, or a cheap reversible tag/status write with a `reversibleBy` note — never an irreversible action;
- names a manifest `labelSets` id and calls the one classify transport with the records as state;
- is marked `billed` in the tool manifest, so the parity check requires its per-tenant budget, and the classify
  budget is decremented in the same transaction the call is recorded;
- returns `choice` + `confidence`, auto-resolving at or above the threshold and leaving the rest for a human.

Nothing here is new plumbing: the `assertRole` gate, the manifest parity check and the billed-budget rule all
already exist on the MCP surface, which is why this is the first call to build and the one that proves the
primitive before any webhook-time classification is wired.

Sources: app-2, app-3.
