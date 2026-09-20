# Carrying code over from an earlier attempt

A rebuild often has a donor: an earlier attempt whose domain code is worth keeping and whose tooling is not.
The scaffold is built first, empty; the donor's code enters afterwards, module by module, on the new repo's
terms.

## What crosses and what does not

Crosses, one module at a time, only when the new repo's tests pass with it:

- `app/` modules that are pure domain logic or thin routes over the new app's Shopify server module.
- `prisma/` migrations that the new schema still needs, re-based on the new first migration (the one that
  creates the roles and the isolation canary), never applied out of order.
- Tests that assert behaviour the new app keeps.

Never crosses:

- `.engine/`, `.claude/`, `.cursor/` or any agent state: the new repo's `.claude/` is the kit's shell plus its
  own manifest, and the donor's rules encode the donor's incidents.
- CI, workflows, scripts and hooks: the shell's CI rehearses migrations and scans secrets already; a donor
  workflow re-introduces the failure it was written around.
- Session storage, auth or webhook plumbing: the template's is current (expiring offline tokens, the
  React Router adapter); a donor's copy is older by definition.
- Environment files, tokens, store handles, client ids: a scaffold carries no account fact.

Rule: copy one module, run the new repo's tests, commit; the next module only after green. A module that
needs the donor's tooling to pass is rewritten, not imported.

## Re-keying the ADR log

The donor's decisions are still decisions. Copy its records into `docs/adr/` keeping their numbers where they
do not collide with the scaffold's (`0001-scaffold.md` is taken; a donor `0001` becomes the next free number
and its old number is noted in the Context section). Each record keeps its date and status; a decision the new
app reverses gets a new record that supersedes it rather than an edit. Add every record to the ADR index and
strike its entry from `SEEDS.md` when it answers a seed. The docs-consistency test fails on a record without an
index row.

## Migrations from a donor

A donor migration is SQL written for the donor's roles and tables. Before it crosses: it runs after the new
first migration; it names the new runtime role in its grants and policies; every table it creates is
tenant-bound (`tenant_id NOT NULL`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, policies with `WITH CHECK`); and
`prisma migrate diff --exit-code` is clean against the new schema afterwards. A migration that fails any of
these is regenerated from the new schema, and the donor SQL is read only as a reference.

## Before the first push

Run the isolation probes as the runtime role (`tenancy`'s `isolation-probe.md`): the model registry must list
every carried-over model, and the canary, list, read, update, delete and forge probes must pass. Then run the
tripwires under `checks.tripwireDir` and `test/docs-consistency.test.mjs`. Push only when all of it is green;
a donor module that only passes with a probe skipped stays out.

Sources: app-3 (rebuild plan: code disposition, forbidden patterns, probe contract); app-2 (contributor guide: migrations cross only re-based).
