---
paths:
  - "**/prisma/**"
  - "**/schema.prisma"
  - "**/*.server.ts"
---

<!-- .claude/rules/prisma.md (shopify-app-kit template). Seeds from the kit's `release/references/migrations-and-zero-downtime.md` and `tenancy/references/`; reads
     database.provider, database.rls and paths.prisma from .claude/shopify-app.json. -->

# Prisma and the database

- Migrations own everything in the database: tables, roles, grants, RLS policies and views are hand-authored SQL
  inside migration files, never created by hand or from a console.
- Every domain table carries `tenant_id NOT NULL` with a foreign key, `ENABLE` and `FORCE ROW LEVEL SECURITY`,
  and policies with `WITH CHECK` on writes. The isolation probes (run as the runtime role) fail CI otherwise.
- The app connects as its own runtime role through `DATABASE_URL` (no `BYPASSRLS`; the provider's default
  superuser role bypasses RLS). `DIRECT_DATABASE_URL` is the owner role, read by migrations only.
- All tenant-scoped access goes through the transaction wrapper (`withTenant`) that runs `SET LOCAL`; the raw
  client is not exported, and the import guard rejects it outside the sanctioned files.
- Never `prisma db push` or `migrate reset` where a shared or production database is reachable (the kit's
  `guard-migrations` hook blocks `migrate reset`, `db push --force-reset` / `--accept-data-loss` and a `db execute`
  that drops or truncates). The dev command refuses to migrate without `DEV_DATABASE_FINGERPRINT` matching `DATABASE_URL`.
- CI applies every migration from an empty database and runs `migrate diff --exit-code`; a schema edit ships with
  its migration in the same PR, and a generated migration is never edited in place.
