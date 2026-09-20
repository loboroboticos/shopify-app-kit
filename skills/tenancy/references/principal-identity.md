# Principal identity and the audit trail

Who did what, recorded so that it cannot be rewritten. A merchant's staff user and an agent acting for them are
both principals; every write names one.

## One Principal table per tenant

A `Principal` row lives under a tenant (`tenant_id NOT NULL`, RLS like any domain table) with `type` of `user`
or `agent`, a display name, and for agents a `parentPrincipalId` pointing at the user who created the grant or
token the agent acts under. Roles and permissions hang off the principal, not off the Shopify user id directly,
so an agent can hold a narrower role than its parent and be revoked without touching the parent.

Rule: an MCP token, an API key or a scheduled job runs as an `agent` principal with a parent; nothing runs as
"the system" with no principal.

## Every write stamps the actor from transaction context

`withTenant` (or a `withPrincipal` wrapper around it) places the current principal id in the transaction
context; the data layer reads it from there to fill `createdBy` and `updatedBy` on every insert and update and
to write the audit row. The caller never passes the actor as an argument, so a handler cannot attribute a write
to someone else.

Rule: a data-layer write without an actor in context throws; the probe suite's write probes assert the stamped
principal equals the one in context.

## Append-only audit

The audit table records every write (tenant, principal, table, row id, verb, before/after or a diff, time). The
runtime role holds `SELECT` and `INSERT` on it and nothing else; the verb probes fail CI if an `UPDATE` or
`DELETE` grant appears. The only code path that deletes from it is the compliance redaction handler, which
runs under a dedicated function the migrations define with the minimum rights to remove one shop's rows.

Rule: no soft-delete flag, no "correct the audit row" endpoint; a mistaken write is corrected by another write,
and both stay in the trail.

Sources: app-3 (ADR series: principal identity, append-only audit); app-2 (contributor guide: actor from context).
