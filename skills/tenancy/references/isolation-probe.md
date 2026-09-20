# The isolation probe suite

Policies are only as good as the test that tries to cross them. The probe suite runs in CI against a real
database, as the role the app runs as, and tries every path a request could take into another tenant's rows.

## The isolation canary

A permanent synthetic tenant-class table, created by an early migration and never used by a feature, exists so
the probe suite always has a real RLS-bound table to exercise, even before the first domain table lands and
after the last one is refactored away. It carries the same shape as every domain table (`tenant_id NOT NULL`,
FK, ENABLE+FORCE, policies, a tenant-leading index) and a single payload column.

Rule: the canary is registered in the probe registry like any model, and a migration that drops or alters it
is a review blocker; it is the proof that the pattern still holds.

## The model registry drives the probes

A registry file lists every Prisma model that holds tenant data with, per model, how to create a row, how to
list, read, update and delete it through the app's data layer, and which webhook and job paths write it. The
probe suite iterates the registry: for each model it creates rows under two tenants, then as tenant A attempts
to list, read, update and delete tenant B's rows (expecting empty results or a policy error), attempts to
insert or update a row with a forged `tenant_id` (expecting the `WITH CHECK` failure), and drives the webhook
and job paths with tenant B's identifiers. A model in the schema that is missing from the registry fails a
separate check, so a new table cannot ship without probes. A deliberately unscoped query (the raw client, no
`SET LOCAL`) is a negative test that must fail; if it succeeds, the runtime role has gained a bypass.

Rule: the registry is the list of what is tested; the schema-versus-registry check is what keeps it complete.

## Probes run as the runtime role

The suite connects with `DATABASE_URL` (the runtime role), never with the owner role. A suite that runs as the
owner passes every probe because the owner bypasses the policies, and proves nothing.

Rule: the suite asserts at startup that the connected role is not a superuser, does not own the domain tables
and has no `BYPASSRLS`; it refuses to run otherwise.

## Verb probes assert the grant floor

Beyond row isolation, a probe per table asserts which SQL verbs the runtime role holds. The identity and audit
tables allow `SELECT` and `INSERT` only; a widened grant (an `UPDATE` on the audit table, a `DELETE` on the
principal table) turns CI red even though no row crossed a tenant.

Rule: the expected verbs per table live in the registry next to the model; the probe reads
`information_schema.role_table_grants` for the runtime role and compares.

Sources: app-3 (rebuild plan: isolation canary and probe contract); app-2 (contributor guide: unscoped-query negative test).
