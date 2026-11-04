# Tripwire patterns

## The contract

Fail the PR the moment two sides disagree, and say in the message which file to fix and how. A tripwire that
fails with "expected true to be false" has met half the contract; the reader still has to reconstruct the fix.
Keep the repair string as a constant next to the assertion:

```js
const REPAIR = `set [webhooks] api_version = "${expected}" in ${toml}`;
assert.equal(tomlVersion, expected, REPAIR);
```

## A rot detector, not a proof

A tripwire detects that a fact rotted; it does not prove the code correct. Regex over source is fine when the
message is precise ("`routes/webhooks/orders-create.ts` must call `withWebhook(` on its exported handler"); strip
comments first so a commented-out call does not pass.

## Allowlists only shrink

Known debt goes in an allowlist inside the test (a file that legitimately skips a rule, with a one-line reason
per entry). Two tests guard it:

1. Everything not in the allowlist obeys the rule.
2. Every allowlisted entry still exists and still violates the rule, so a paid debt's entry is deleted and the
   list only shrinks; without it, stale entries hide new violations behind old names.

## Patterns worth copying

**A single data binding.** One JSON file (the manifest, a store-bindings file, a plan table) is the source of a
value, and every literal that cannot import it (a toml, a workflow env, a Liquid block, a README snippet) is
asserted against it. The test reads the binding and greps each consumer for the value; the repair message names
the consumer and the value.

**Vendored-copy drift.** A copied file (the kit's guards under `.claude/hooks/kit/`, a shared schema) matches its
source byte-for-byte or by version header; the repair is the sync command (`/shopify-app-kit:sync`, `cp`, a script).

**Docs-map completeness.** Every document under the docs directory is named in the index that maps facts to
owners, and every path the index names exists. A second assertion: no dated headings (`## 2026-08 ...`) in a
reference doc, because dates belong in the PR description (the `docs-owner` skill's rule).

**Scheduled-workflow liveness.** The ops ritual's hand-written list of scheduled workflows equals the set of
files under `.github/workflows/` that carry `schedule:`. When someone adds a cron and forgets the ritual, or
removes one and leaves the ritual stale, the test names the missing or extra entry.

**A manifest tripwire.** The repo's tooling facts (`.claude/shopify-app.json`) versus what the repo actually
contains: each `paths.appTomls` entry exists and states `apiVersion.expected`, each `apiVersion.pins` file
states it, `deploy.targets.*.flyToml` exists and carries the release command, `deploy.targets.*.workflow` exists
and is listed in `protectedWorkflows` when it deploys, `packageManagers` directories hold the matching lockfile;
no toml requests a theme-write or script-tag scope, the production toml's `name` fits the pinned-nav limit (the
companion's `shopify-app-store-review` states it), and scopes have one source the others are checked against.

**Registry parity.** A registry and its consumers agree in both directions: every tool definition in the code is
in the MCP manifest and every manifest entry has a definition; the kit's own `test/skills-parity.test.mjs`
(allowlisted frontmatter, every reference linked) and `test/agents-parity.test.mjs` are this pattern.

**Default-deny gate audit.** Every exported route handler, server action or RPC method authenticates (calls the
admin, webhook, app-proxy or public authenticator), or sits in an allowlist with a written reason. Judge per
exported method, not per file; strip comments first; detect re-export forms (`export { x } from`,
`export default`, `module.exports`) so an unauthenticated handler cannot hide behind a re-export. The repair
message names the export and the authenticator it should call. Every document response sends the package's
`frame-ancestors` header (`addDocumentResponseHeaders`), so the admin is the only frame that can embed it.

**Embedded document conformance** (https://shopify.dev/docs/apps/launch/built-for-shopify/requirements). Every
route module that renders its own `<html>` or sits outside the app layout renders the package's `AppProvider`, or
sits in a shrinking allowlist with a reason; `package.json` carries no `@shopify/app-bridge` v3 dependency. The nav
has exactly one `rel="home"` link, every href resolves to a route file, and no item nests. Once the UI exists the
consumer owns the static checks: a back path on nested routes, the save bar on settings forms, modal slots,
overlays opened only from handlers, critical tone only on errors and destructive actions, and one primary action
per section, judged, with a shrinking allowlist.

## What a tripwire is not

Not a snapshot (a relation, not a blob), a lint (it reads two sides) or a probe (offline: `checks-vs-probes.md`).

Sources: app-1 (ops doc, CI workflows); app-2 (contributor guide); app-3 (ADR series, MCP auth substrate).
