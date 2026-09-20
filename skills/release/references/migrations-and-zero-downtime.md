# Migrations without downtime or lost webhooks

Where migrations run, how they are rehearsed, and why a running app must not be up while they do.

## Rehearse in CI

Every PR runs `prisma migrate deploy` against a throwaway database service (a Postgres service container in the
job) from an empty schema. That catches a migration that only works on the author's dirty local database. The
same job runs `prisma migrate diff --from-migrations <dir> --to-schema-datamodel <schema> --exit-code` so a
schema change without a migration, or a migration without a schema change, fails the PR.

Rule: both steps in the one verify gate (`ci-posture.md`); the deploy workflows reuse that gate rather than
re-implementing it.

## Migrate through the branch, never from a laptop

When the hosted beta shares its database with local development (`database.sharedDevDbWithBeta` in the
manifest), a migration applied from a laptop reaches the shared database immediately but never reaches beta's
deploy, so beta's drift check fails on the next run and beta's code runs against a schema it does not know.

Rule: migrations land by pushing the branch; the deploy workflow applies them. Local `migrate dev` only against a
local database. With `sharedDevDbWithBeta: true`, the `review-correctness` agent treats a destructive migration
as P0 because it lands on the shared database before beta ships the code that expects it.

## Migrations run in the release command, not on boot

A migration in the process's startup path runs once per instance, races between instances, and turns a rollout
into a lock storm. The hosting platform's release command (`[deploy] release_command` for the platform config,
or the equivalent pre-start hook) runs once per deploy, before the new instances start.

Rule: `prisma migrate deploy` in the release command; the app process never migrates. A tripwire asserts the
hosting config carries the release command and the start script does not.

## Scale to zero before migrating when webhooks are in flight

While a migration runs, a still-running instance accepts webhook deliveries against a schema mid-change. The
handler fails or, worse, succeeds partially, and the platform marks the delivery done. Those deliveries are gone.

Rule: when `deploy.scaleToZeroBeforeMigrate` is true, the release scales the app to zero (`fly scale count 0`
or the platform's equivalent) before the migration and back up after. The platform queues webhook deliveries
to an app that is down and retries them; it does not retry ones a half-migrated app acknowledged. The `release`
skill says this at step 4; the deploy workflow does it.

## Forward-only

Migrations are forward-only and reversible in practice: a column is added nullable, backfilled, then made
required in a later migration; a column is dropped only after no deployed code reads it. Never `prisma db push`
or `migrate reset` in any script that can see a shared or production database.

Sources: app-1 (ops doc, CI workflows); app-3 (ADR series, RLS Postgres).
