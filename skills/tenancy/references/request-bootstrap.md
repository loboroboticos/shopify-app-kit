# Request bootstrap and tenant provisioning

Where the tenant id comes from on each request, when the tenant row is created, and why background work never
runs without a tenant.

## Tenant identity derives server-side from a verified credential

Every entry point derives the shop, and from it the tenant, from something the server verified: the session
token an embedded request carries (verified by the app library), the shop header of a webhook whose HMAC
passed, or the tenant prefix of an MCP token whose grant row was found. Nothing the client can set (a query
parameter, a form field, a cookie value, an unsigned header) ever selects the tenant. The derived tenant id is
what `withTenant` receives; a handler that accepts a tenant id as an argument from request data is the
client-trusted tenancy pattern the forbidden-patterns ADR names.

Rule: `withTenant` is called with a value produced by the authenticator, never with a value parsed from the
request body or URL; the review agents treat the latter as a blocker.

## Lazy provisioning on the first authenticated request

The tenant row is created (or found) on the first authenticated request from a shop, inside the request's
bootstrap, as an idempotent create-or-find keyed on the shop domain. It is not created in the app library's
`afterAuth` hook: the library persists the session before it calls `afterAuth` and never calls it again for
that session, so a hook that throws (a transient database error, a bad migration) leaves a shop with a valid
session and no tenant row, and no later request can repair it. Lazy provisioning retries on every request until
it succeeds.

Rule: `afterAuth` registers webhooks and nothing else; tenant provisioning lives in the request bootstrap and is
idempotent.

## Crons iterate tenants

A scheduled job (a sync, a reconcile, a token refresh sweep) lists the tenants, then enters each with
`withTenant` and does its work inside. There is no "all shops" query in the data layer: a function that reads
across tenants would need a bypass role, and the probe suite's negative test exists to catch exactly that. Per-
tenant iteration also bounds the blast radius of a failure to one tenant and lets the job log and retry per
tenant.

Rule: a job that needs cross-tenant aggregates reads from a view the migrations define for that purpose, with
its own policy, never from the raw client.

Sources: app-3 (rebuild plan: request bootstrap, tenant provisioning); app-2 (contributor guide: afterAuth trap).
