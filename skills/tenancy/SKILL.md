---
name: tenancy
description: Build or change tenant isolation in a multi-tenant Shopify app the way this repo's .claude/shopify-app.json declares it: fail-closed row-level security with two database roles, the isolation probe suite, server-side tenant bootstrap, principal and append-only audit identity, one refresh chokepoint for expiring offline tokens, and the webhook intake seam. Use when adding a table or Prisma model, a query path, a cron or background worker, a webhook handler, a session or token change, or when a review asks whether data is shop-scoped.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(jq *), Bash(cat *), Bash(grep *), Bash(node *), Bash(npm test*), Bash(pnpm test*), Bash(npx prisma *), Bash(pnpm prisma *)
---

# shopify-app-kit tenancy

One tenant's data must never be readable or writable from another tenant's request, worker or webhook, and the
database must enforce that even when the application code is wrong. Every step below exists because a rebuild
found a path that trusted the client, bypassed the policy or stranded a shop. Detail and rationale live in
`references/`; the steps are the contract.

## Steps

1. **Read the manifest.** From `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` take `database.provider`,
   `database.rls`, `auth.expiringOfflineTokens`, `paths.prisma`, `paths.shopifyServer`, `paths.webhookHandlers`
   and `webhooks.compliance`. With `database.rls` false, the shop-scoping rules below still hold but are
   enforced in the data layer, not by the database; say so in the report.

2. **A new table or model** carries `tenant_id NOT NULL` with a foreign key, `ENABLE` and `FORCE ROW LEVEL
   SECURITY`, policies against `current_setting('app.tenant_id', true)` with `WITH CHECK` on writes, and a
   tenant-leading composite index, all inside the migration SQL. Register the model in the probe registry in the
   same change; an unregistered model fails CI (`references/rls-fail-closed.md`, `references/isolation-probe.md`).

3. **A new query path** goes through the transaction wrapper (`withTenant`) that runs `SET LOCAL`; the raw
   client is never imported outside the sanctioned files (the build guard rejects it). Every write stamps the
   actor from the transaction context (`references/principal-identity.md`).

4. **Tenant identity** derives server-side from a verified credential: the session token, the HMAC-verified
   webhook, the tenant-prefixed MCP token. Never from a query string, a form field or a header the client sets.
   Provisioning is lazy create-or-find on the first authenticated request, never in `afterAuth`
   (`references/request-bootstrap.md`).

5. **A cron or worker** iterates tenants and enters each through the same wrapper; there is no "all shops" mode
   in the data layer. A worker that refreshes access tokens calls the one per-shop-locked refresh function
   (`references/expiring-tokens.md`). With `auth.expiringOfflineTokens` true, check the session model carries
   `refreshToken` and `refreshTokenExpires` and the purge keys on the refresh expiry.

6. **A webhook handler** follows verify, record, process, mark: HMAC before anything is recorded, intake keyed
   on the delivery id, compliance payloads processed in memory and never persisted, the tenant re-derived from
   the verified payload for destructive topics (`references/webhook-intake.md`).

7. **Run the probes** as the runtime role (`npm test` or `pnpm test` in `paths.server`, which must include the
   isolation suite), then report: the tables touched and their policies, the registry rows added, which
   credential each new path derives the tenant from, and any manifest edit.

## References

- `references/rls-fail-closed.md`: tenant-bound tables, two roles from the first migration, migrations own
  roles and policies, `withTenant` and `SET LOCAL`, tenant-leading indexes.
- `references/isolation-probe.md`: the isolation canary, the model registry, probes as the runtime role, verb
  probes asserting the grant floor.
- `references/request-bootstrap.md`: tenant identity from a verified credential, lazy provisioning and the
  `afterAuth` trap, crons iterate tenants.
- `references/principal-identity.md`: the `Principal` table, actor stamping, append-only audit.
- `references/expiring-tokens.md`: the requirement and its dates, the library flag and session columns, one
  refresh chokepoint, purge on refresh-token expiry.
- `references/webhook-intake.md`: verify, record, process, mark; 401 before recording; idempotent intake;
  compliance payloads never persisted; the signature covers the body only.
