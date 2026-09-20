# Lessons index

One row per lesson. The `home` column is the only place the lesson's text lives; `rule` is a one-line reminder,
not a substitute. Classes and sources are defined in `README.md`. `test/lessons-index.test.mjs` checks that every
home exists, every anchor matches a heading, and every reference file is the home of at least one row.

| id | rule | class | home | source |
| --- | --- | --- | --- | --- |
| cli-1 | Always pass `--config` to `app dev` / `app deploy`; the last-linked toml is an invisible default | rule | skills/dev-loop/references/cli-traps.md#trap-1-the-implicit-default-config | app-1, app-2 |
| cli-2 | `automatically_update_urls_on_dev` is false on the production toml and true only on the dev toml | rule | skills/dev-loop/references/cli-traps.md#trap-2-automatically_update_urls_on_dev | app-1 |
| cli-3 | The quick tunnel expires after about three hours and a dead tunnel looks like an outage | recipe | skills/dev-loop/references/cli-traps.md#trap-3-the-quick-tunnel-expires-silently | app-1 |
| cli-4 | End every dev session with `app dev clean` when the registration is shared with a hosted environment | recipe | skills/dev-loop/references/cli-traps.md#trap-4-ending-without-app-dev-clean | app-1 |
| cli-5 | A dev extension handle never shares the production handle's prefix, so a slug probe cannot confuse them | rule | skills/dev-loop/references/cli-traps.md#handles-and-released-versions | app-1 |
| api-1 | The GraphQL client pin does not govern webhook payloads; each topic carries its own version | rule | skills/admin-api/references/api-version-drift.md#webhook-payloads-are-not-governed-by-the-client-pin | app-1, app-3 |
| api-2 | Log `topic` and `x-shopify-api-version` on every accepted delivery, before any test-notification branch | rule | skills/admin-api/references/api-version-drift.md#webhook-payloads-are-not-governed-by-the-client-pin | app-1 |
| api-3 | A stale pin fails silently forward to the oldest supported version; tripwire the pins | rule | skills/admin-api/references/api-version-drift.md#a-stale-pin-fails-silently-forward | app-1, app-2 |
| api-4 | A version bump is its own PR, never a side effect of a dependency upgrade | rule | skills/admin-api/references/api-version-drift.md#a-version-bump-is-its-own-pr | app-1 |
| api-5 | Client pin, toml `[webhooks] api_version`, extension tomls and `apiVersion.expected` must all agree | rule | skills/admin-api/references/api-version-drift.md#the-pins-that-must-agree | app-1, app-2 |
| wh-1 | Verify the webhook HMAC over the raw body before parsing; a failure is a 401 with no processing | rule | skills/admin-api/references/webhooks.md#verify-the-hmac-over-the-raw-body-before-parsing | app-2, app-3 |
| wh-2 | One wrapper owns the webhook preamble and a build-time check asserts every receiver uses it | rule | skills/admin-api/references/webhooks.md#one-wrapper-owns-the-preamble | app-2, app-3 |
| wh-3 | The three compliance topics need real redaction handlers, never a 200 stub; `app/uninstalled` and `app/scopes_update` always | rule | skills/admin-api/references/webhooks.md#the-topics-every-app-needs | app-1, app-2 |
| wh-4 | Read REST-shaped payload keys with `in`, warn on degradable fields, throw only for the GraphQL id and `created_at` | rule | skills/admin-api/references/webhooks.md#read-rest-shaped-payloads-by-key-presence-not-truthiness | app-2 |
| wh-5 | A handler that takes the id and re-fetches over GraphQL is insulated from payload drift by construction | recipe | skills/admin-api/references/webhooks.md#insulate-the-handler-from-the-payload | app-2, app-3 |
| gql-1 | A throttle is an `errors` entry with code `THROTTLED` on HTTP 200; match the code exactly | rule | skills/admin-api/references/graphql-errors.md#throttles | app-1, app-2 |
| gql-2 | Retry on `THROTTLED` and 429/500/502/503/504; never on `MAX_COST_EXCEEDED` | rule | skills/admin-api/references/graphql-errors.md#retry-policy | app-2 |
| gql-3 | A non-empty `userErrors` is a failed write; throw, never proceed on a 200 that carries them | rule | skills/admin-api/references/graphql-errors.md#usererrors-is-a-failed-write | app-1, app-2 |
| gql-4 | The GraphQL transport module is never a server-action or RPC endpoint | rule | skills/admin-api/references/graphql-errors.md#the-transport-is-not-an-endpoint | app-2 |
| meta-1 | Storefront Liquid reads app-owned metaobjects through `$app:`; never a literal numeric app id | rule | skills/admin-api/references/metaobjects-and-app-accessors.md#storefront-liquid-reads-them-through-app | app-1 |
| meta-2 | Storefront metafield and metaobject reads are edge-cached for hours; never poll for freshness or fix a stale read in code | rule | skills/admin-api/references/metaobjects-and-app-accessors.md#storefront-reads-are-edge-cached | app-1 |
| meta-3 | Entitlement as app-data metafields on the AppInstallation lets a storefront extension work with no proxy and no server call | adr-seed | skills/admin-api/references/metaobjects-and-app-accessors.md#entitlement-as-app-data-metafields | app-1 |
| dist-1 | Distribution type is locked at registration creation; going public is a new registration every install re-installs under | adr-seed | skills/admin-api/references/distribution-is-one-way.md#custom-vs-public-is-locked-at-creation | app-1, app-3 |
| dist-2 | Custom distribution forces the Billing API; there is no managed pricing | rule | skills/admin-api/references/distribution-is-one-way.md#custom-distribution-forces-the-billing-api | app-1 |
| dist-3 | One Node process serves one registration; a second registration is a second deployment or a per-request map, decided early | adr-seed | skills/admin-api/references/distribution-is-one-way.md#one-process-serves-one-registration | app-1, app-3 |
| bill-1 | The billing test flag is off in production and on everywhere else, read in one module from `billing.testFlag` | rule | skills/release/references/billing-live-posture.md#the-test-flag-is-an-environment-fact | app-1 |
| bill-2 | Tier and plan names are data; a rename is a data migration | rule | skills/release/references/billing-live-posture.md#tier-and-plan-names-are-data | app-1 |
| bill-3 | Every writer of entitlement state invalidates the per-shop cache; tripwire the contract | rule | skills/release/references/billing-live-posture.md#cache-invalidation-is-a-contract | app-1 |
| bill-4 | A scheduled reconcile job with a frozen grace window backstops a missed billing webhook | recipe | skills/release/references/billing-live-posture.md#the-reconcile-job-is-the-backstop | app-1 |
| bill-5 | Comp access is a first-class ledger; test and live ledgers stay apart | rule | skills/release/references/billing-live-posture.md#comp-access-is-a-ledger | app-1 |
| mig-1 | Rehearse `prisma migrate deploy` against a throwaway database and run `migrate diff --exit-code` on every PR | recipe | skills/release/references/migrations-and-zero-downtime.md#rehearse-in-ci | app-1 |
| mig-2 | With a shared dev/beta database, migrate through the branch, never from a laptop | rule | skills/release/references/migrations-and-zero-downtime.md#migrate-through-the-branch-never-from-a-laptop | app-1 |
| mig-3 | Migrations run in the platform's release command, never on process boot | rule | skills/release/references/migrations-and-zero-downtime.md#migrations-run-in-the-release-command-not-on-boot | app-1, app-3 |
| mig-4 | Scale to zero before migrating when webhooks are in flight; a running app swallows them | recipe | skills/release/references/migrations-and-zero-downtime.md#scale-to-zero-before-migrating-when-webhooks-are-in-flight | app-1 |
| ci-1 | Pin every action by commit SHA with the version in a trailing comment | rule | skills/release/references/ci-posture.md#pin-every-action-by-commit-sha | app-1, app-2 |
| ci-2 | Least-privilege `permissions:` and a deliberate `concurrency` group per workflow | rule | skills/release/references/ci-posture.md#least-privilege-permissions-per-workflow | app-1 |
| ci-3 | A workflow whose own file is an input lists itself in its `paths:` filter | rule | skills/release/references/ci-posture.md#a-workflow-whose-file-is-an-input-lists-itself-in-paths | app-1 |
| ci-4 | Scheduled workflows are disabled after 60 days of inactivity; keep a liveness check of every `schedule:` workflow | rule | skills/release/references/ci-posture.md#scheduled-workflows-die-after-60-days-of-inactivity | app-1 |
| ci-5 | Gitleaks from a pinned, checksum-verified binary with an allowlist where every entry says why | rule | skills/release/references/ci-posture.md#secret-scanning | app-1, app-2 |
| ci-6 | One reusable verify gate via `workflow_call` that PRs and deploys share; a failure-issue action for scheduled runs | recipe | skills/release/references/ci-posture.md#one-reusable-verify-gate | app-1 |
| trip-1 | A tripwire fails the PR when two sides disagree and names the file and the value to write | rule | skills/tripwire/references/tripwire-patterns.md#the-contract | app-1, app-2 |
| trip-2 | Allowlists of known debt only shrink; a second test fails when an entry no longer exists | rule | skills/tripwire/references/tripwire-patterns.md#allowlists-only-shrink | app-2 |
| trip-3 | Every exported handler authenticates or sits in an allowlist with a reason; judged per export, comments stripped, re-exports detected | rule | skills/tripwire/references/tripwire-patterns.md#patterns-worth-copying | app-2, app-3 |
| probe-1 | Checks are offline and ride the build (git-free, network-free); probes make real requests and never join the check chain | rule | skills/tripwire/references/checks-vs-probes.md#name-them-apart | app-1, app-2 |
| docs-1 | One document owns each fact; every other mention points and never restates; the docs map is tripwired | rule | skills/docs-owner/references/single-owner.md#the-rules | app-1, app-2, app-3 |
| docs-2 | Reference docs state the current rule; incidents, dates, run ids and closed issue numbers go to history | rule | skills/docs-owner/references/single-owner.md#the-rules | app-1, app-2 |
| docs-3 | Before adding a warning, name the check that enforces it, or write the check | rule | skills/docs-owner/references/single-owner.md#the-rules | app-1, app-2 |
| docs-4 | The always-loaded instructions file holds only what a session needs most of the time; path-scoped rules load on touch | rule | skills/docs-owner/references/single-owner.md#the-anti-pattern | app-2 |
| adr-1 | A decision earns an ADR only if significant, constraining, hard to reverse and with a real rejected alternative | rule | skills/docs-owner/references/adr-shape.md#when-a-decision-earns-a-record | app-3 |
| adr-2 | Product and tooling decisions live in separate ADR series, each with an index of one row per record | rule | skills/docs-owner/references/adr-shape.md#two-series | app-3 |
| lens-1 | Every query touching shop data is shop-scoped when `database.rls` is false; a cross-shop query is P0 | lens | agents/review-correctness.md#manifest-checks | app-3 |
| lens-2 | A destructive migration under `sharedDevDbWithBeta` is P0; no `db push` or `migrate reset` near shared data | lens | agents/review-correctness.md#manifest-checks | app-1 |
| lens-3 | App tomls in `paths.appTomls` stay structurally equal apart from registration-specific fields | lens | agents/review-correctness.md#manifest-checks | app-1 |
| lens-4 | A hard-coded billing test flag under `billing.live` is P0; plan names and prices never change silently | lens | agents/review-correctness.md#manifest-checks | app-1 |
| lens-5 | Business logic, GraphQL strings or Prisma calls inline in a route belong in the canonical layer | lens | agents/review-quality.md#canonical-layers-in-a-shopify-app | app-1, app-2 |
| lens-6 | A file never crosses the repo's `checks.fileSize` limit because of a branch; decompose first | lens | agents/review-quality.md#non-negotiable-standards | app-2 |

## History

No lessons have been superseded yet. When one is, add a dated subsection here (`### YYYY-MM-DD <id>`) with the
old rule and why it no longer holds, and remove its row from the table above.
