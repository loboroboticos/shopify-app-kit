# Row-level security that fails closed

The database enforces tenant isolation so that a wrong query, a forgotten `where` or a bypassed helper returns
nothing rather than another tenant's rows. Every rule here removes a way for the application to be the only line
of defence.

## Every domain table is tenant-bound

Every table that holds tenant data carries `tenant_id NOT NULL` with a real foreign key to the tenant table,
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `ALTER TABLE ... FORCE ROW LEVEL SECURITY` in the migration
SQL, and policies that compare `tenant_id` with `current_setting('app.tenant_id', true)`. Reads use `USING`;
writes add `WITH CHECK` so a row cannot be inserted or updated into another tenant. `FORCE` matters: without it
the table owner bypasses the policy, and in a small app the owner is often the role the code runs as.

Rule: a migration that creates a table without all four (column, FK, ENABLE+FORCE, policies with `WITH CHECK`)
fails the isolation probes; the `prisma-migration-reviewer` agent blocks it when `database.rls` is true.

## Two roles from the first migration

The first migration creates two database roles. The runtime role is what the app connects as through
`DATABASE_URL`: not the table owner, not a superuser, and never granted `BYPASSRLS`. The owner role connects
through `DIRECT_DATABASE_URL`, is used by `prisma migrate` only, and never appears in the app's runtime
environment. On a hosted Postgres the default `postgres` role typically carries `BYPASSRLS` (it does on
Supabase), so an app that connects with the provider's default credentials has no row-level security at all,
whatever the policies say.

Rule: `DATABASE_URL` names the runtime role; a probe connects with it and asserts `rolbypassrls` is false and
the role is not the owner of any domain table. `DIRECT_DATABASE_URL` is read by the Prisma datasource's
`directUrl` and by nothing else (a tripwire greps for it).

## Migrations own roles, grants, policies and views

Roles, grants, RLS policies, views and functions are hand-authored SQL inside Prisma migration files, not
console work. Prisma's schema does not model them, so each is written into the migration that introduces the
table it protects, and `prisma migrate diff` stays clean because the diff compares the data model only. A
policy created from a console exists in one environment and vanishes on the next `migrate deploy` from empty.

Rule: no `CREATE ROLE`, `GRANT`, `CREATE POLICY` or `CREATE VIEW` outside `paths.prisma`'s migrations; the CI
migrate rehearsal from an empty database (`release` skill, `migrations-and-zero-downtime.md`) proves the
migrations alone produce a working, isolated schema.

## One entry point: withTenant and SET LOCAL

All tenant-scoped access runs inside a transaction wrapper, `withTenant(tenantId, fn)`, that opens a
transaction, runs `SET LOCAL app.tenant_id = $1`, calls `fn` with the transaction client, and commits.
`SET LOCAL` scopes the setting to the transaction, so a pooled connection carries nothing into the next
request; through a transaction pooler the connection string sets `pgbouncer=true` so Prisma does not rely on
session state. The raw Prisma client is a module-private value that only the wrapper (and a short list of
sanctioned files such as the session storage adapter and the migration runner) may import; a build-time guard
greps every import of the client module and fails on any file outside the list.

Rule: the wrapper is the only exported way to touch tenant data; the import guard is a check, not a review
note; a call site that wants the raw client adds itself to the sanctioned list with a reason, in a PR.

## Tenant-leading composite indexes

Every index on a domain table leads with `tenant_id`, and unique constraints include it (`(tenant_id,
external_id)`, not `(external_id)`). The policy filter then uses the index, and a uniqueness rule that is per
tenant in the product is per tenant in the database, so two tenants can hold the same external identifier.

Rule: an index or unique constraint on a domain table that does not lead with `tenant_id` is a review finding;
the probe suite's registry lists the expected unique keys per model.

Sources: app-3 (ADR series, rebuild plan: RLS Postgres); app-2 (contributor guide: sanctioned raw-client files).
