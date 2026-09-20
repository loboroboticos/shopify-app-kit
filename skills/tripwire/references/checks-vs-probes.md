# Checks versus probes

Two kinds of verification that look alike in a test runner and must never be wired the same way.

## A check

Runs offline, in milliseconds, on every build: unit tests, tripwires, lint, typecheck, schema validation. It
reads the filesystem and nothing else.

- **Git-free.** Hosting builds and some CI jobs run from shallow clones (`--depth 1`, no tags, detached HEAD),
  so `git log`, `git describe` and `git diff` return nothing useful or fail. A check that shells out to git
  passes locally and fails in the one place it matters.
- **Network-free.** No fetch, no DNS, no MCP call. A check that needs the network is flaky by construction and
  makes the build depend on a third party's uptime.
- **Database-free.** No connection string. The migrate rehearsal in CI (see the `release` skill's
  `migrations-and-zero-downtime.md`) is the one place a build touches a database, and it is a dedicated job with
  a throwaway service, not part of the check chain.

Checks are what `npm test` (or the package manager the manifest names) runs, and what the verify gate calls.

## A probe

Makes real requests or needs a real database: fetch a storefront page and confirm the released extension slug
is in an asset URL; query the Admin API for the active subscription of a test shop; hit the app's health route
on beta; confirm a webhook subscription exists for each topic.

- Runs by hand or from a scheduled workflow with the secrets it needs, never on every PR.
- Has expectations that tolerate the world: the CDN edge cache lag, a tunnel that expired, a rate limit.
- Never joins the check chain. A probe wired into `npm test` turns every PR into a network test and every
  outage into a red build on unrelated changes.

## Name them apart

Scripts are named `check:*` (`check:tripwires`, `check:manifest`) and `probe:*` (`probe:extension-live`,
`probe:webhooks-subscribed`), and the test runner's file glob matches only check files. The name is the
guardrail: nobody wires a `probe:*` script into the build by accident, and a review can reject a check that
imports a probe.

## When a fact needs both

A pin is a check (the toml says the version). Whether the platform serves that version is a probe (the
`x-shopify-api-version` header on a real delivery). Write the check for the PR and the probe for the ops ritual,
and let the docs map name both.

Sources: app-1 (ops doc, CI workflows); app-2 (contributor guide).
