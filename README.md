# shopify-app-kit

A Claude Code plugin for developer sessions that build Shopify apps. It ships generic tooling only: guard hooks
that read a per-repo manifest, skills, review agents and workflows, the repo shell a new app starts from, and
the operating layer (a label set, the issue-filing rules, the scheduled routines' prompt texts).
Nothing in this repo knows about any particular app, store or hosting account; every repo-specific fact lives
in the consumer's `.claude/shopify-app.json`.

The repo root is the plugin root and its own marketplace.

## What you get

| Component | What it does |
| --- | --- |
| `/shopify-app-kit:review` | Deep pre-merge review: the two agents below run in parallel on the branch diff, each checking it against the manifest, and the skill synthesizes one verdict. |
| `agents/review-correctness.md` | Bugs, breakage, security and devex, plus every manifest contract: auth boundaries, API version pins, webhook coverage and compliance, scopes, CLI configs, protected workflows, billing test flag, shop-scoped queries and migrations. |
| `agents/review-quality.md` | Harsh maintainability review against the app's canonical layers (Shopify server module, thin routes, one GraphQL home, per-topic webhooks, shop-scoped data layer), file-size limit from `checks.fileSize`, spaghetti growth, code-judo simplifications. |
| `agents/classifier-reviewer.md` | Classification review keyed to the manifest's `classify` section: every classify call names a declared label set, is billed against a per-tenant budget, auto-acts only at or above its confidence threshold, passes no image to the text-only provider, and leaves deterministic signals as rules. Read-only; the `review` skill launches it when `classify` is declared. |
| `agents/design-review-architecture.md` | Plan-stage reviewer: boundaries, data model, seams, build order, and prose rules that should be checks. Read-only; reports findings, the operator decides. |
| `agents/design-review-feasibility.md` | Plan-stage reviewer: can it be built, shipped and run, given the manifest's deploy, database and billing posture. |
| `agents/design-review-product-intent.md` | Plan-stage reviewer: reads the raw request separately from the plan; is this the right thing, is the scope right, are the success criteria checkable. |
| `agents/design-review-risk-governance.md` | Plan-stage reviewer: how the plan could fail, be abused or cross a rule (trust boundaries, scopes, privacy, compliance, protected paths to production). |
| `agents/qa-review-security-governance.md` | Diff-stage reviewer: is the built change safe to release (authenticators, shop scoping, untrusted input, secrets, compliance, change control). |
| `agents/qa-review-spec-conformance.md` | Diff-stage reviewer: requirement by requirement, met / divergent / untested; a partial or deferred build is a divergence. |
| `agents/qa-review-technical-integrity.md` | Diff-stage reviewer: internal health (layers, performance, observability, reliability, tests, dead code, comments that describe the code). |
| `agents/qa-review-usability.md` | Diff-stage reviewer: does it work well for the merchant, the shopper and the operator (friction, accessibility, error recovery, learnability). |
| `agents/qa-review-divergence-hunter.md` | Diff-stage reviewer that assumes a divergence exists and hunts for it: green tests that check the wrong thing, guardrails that can be slipped past, half-done requirements, code nobody asked for. |
| `agents/prisma-migration-reviewer.md` | Diff-stage reviewer for `schema.prisma` and migrations, keyed to `database.*`, `paths.prisma` and `deploy.scaleToZeroBeforeMigrate`: destructive operations, schema/migration parity, hand-edited SQL, RLS on new tables, the scale-to-zero step, shared-beta drift, refresh-token columns for expiring offline tokens. Never proposes editing a generated migration in place. |
| `agents/storefront-extension-reviewer.md` | Diff-stage reviewer for theme app extensions, a one-line no-op when `paths.extensions` is empty: settings-schema compatibility, platform-minted block uids, edge-cache assumptions, asset size limits, vendored-copy parity with a drift test under `checks.tripwireDir`, no server round-trip on the render path, locales in step with the schema. |
| `/shopify-app-kit:pre-pr-review` | Workflow (`workflows/pre-pr-review.js`): scopes the branch from the manifest, runs the diff-stage roster in parallel (the stack reviewers only when the diff touches their files), merges findings on the same spot, sends every blocker and major to a skeptic, and returns one verdict (`block`, `changes-needed`, `approve`) with the merged findings. Takes an optional base branch or `{ base, pr, reviewers, all }`. |
| `/shopify-app-kit:release-readiness` | Workflow (`workflows/release-readiness.js`): scopes the promotion range (`branches.promotion.from` -> `.to`, or `{ base, head }`), runs only the release dimensions the manifest enables (`api-version`, `webhooks`, `migrations` when the range touches `paths.prisma`, `branch-model`, `billing` when `billing.live`, `extension` when `paths.extensions` is set, an `app-store-review` note for a public app), each as one read-only kit agent on the shared finding shape, verifies every blocker and major, and returns `go`, `go-with-notes` or `no-go` with the findings and a pasteable checklist for the promotion PR body (the `release` skill's list, pre-ticked where a dimension passed). A dimension that returns nothing keeps the verdict off `go`. |
| `/shopify-app-kit:plan-review` | Workflow (`workflows/plan-review.js`): runs the four `design-review-*` agents in parallel on a plan (a markdown file path, a PR number whose body is the plan, or `#<issue>`), with the manifest facts the plan touches and the ADR directory in their prompts; merges findings on the same section, verifies every blocker and major, and returns `sound`, `revise` or `rethink` with the findings and the decisions the plan should record as ADRs (findings a reviewer tags `adr: true`). |
| `hooks/guard-shopify-cli.sh` | PreToolUse guard for `shopify app dev`, `shopify app deploy`, `shopify app config use`, `<pm> run deploy` and `shopify theme dev`, driven by the manifest's `shopifyCli` policies. Fails closed when the manifest or `jq` is missing. |
| `hooks/guard-protected-branch.sh` | PreToolUse guard for `git push`, `gh pr merge`, `gh pr edit --base`, `gh api` writes and `gh workflow run`, driven by `branches.protected` and `deploy.protectedWorkflows`. Lets the session open a promotion PR, never land one. Fails closed when the manifest, `jq` or a PR's base cannot be read. |
| `hooks/guard-package-manager.sh` | PreToolUse guard that keeps `pnpm` and `npm` in the directories `packageManagers` maps them to (exact entry; effective directory after `cd`, `pnpm -C`, `npm --prefix`). Fails closed when the manifest or `jq` is missing. |
| `hooks/guard-migrations.sh` | PreToolUse guard that keeps destructive Prisma commands out of a session: `prisma migrate reset` (under any prefix: `npx`, `pnpm exec`, `pnpm dlx`, `npm exec`, `yarn`, `bunx`, a path, bare), `prisma db push --force-reset` / `--accept-data-loss`, and `prisma db execute` whose command text carries `DROP DATABASE`, `DROP SCHEMA` or `TRUNCATE`. Everything else Prisma passes; `prisma migrate deploy` prints one reminder line when `deploy.scaleToZeroBeforeMigrate` is true. The block message names `database.provider`, `database.sharedDevDbWithBeta` and `paths.prisma`. Prose (a heredoc body, an echo, a commit message) never blocks. Fails closed when the manifest or `jq` is missing, for the guarded forms only. |
| `hooks/lib.sh` | Shared bash the guards source: manifest resolution, block messages, path normalisation, heredoc stripping, command splitting with `cd` tracking. |
| `hooks/doctor.sh` | SessionStart briefing: validates the manifest structurally, prints the app facts, reports vendored-hook drift, checks the two companions (one warning with the install command when `claude plugin list` does not list `shopify-ai-toolkit`, one info line while its telemetry opt-out file is absent, one warning with the pinned `pip install graphifyy==<pin> && graphify install` when graphify is absent; silent without the `claude` binary, never blocks), and, when `gh` is on PATH, prints one `Schedule:` line per scheduled workflow with the age of its last successful run (a warning past twice the cadence read from its cron; silent without `gh`). Silent in repos without a manifest. |
| `/shopify-app-kit:doctor` | Same checks, on demand, plus settings-registration drift; `references/companion.md` has the split between the two companions and the kit. |
| `/shopify-app-kit:sync` | Vendors the guards into the consumer and records the kit version in the manifest. |
| `/shopify-app-kit:new-app <app-name> [--server-dir <dir>] [--pm npm\|pnpm] [--default-branch <b>] [--protected-branch <b>] [--dry-run <dir>]` | Scaffolds a new app: `shopify app init` from the official React Router template (or a clone when init needs an account), the `templates/` shell applied by `skills/new-app/scripts/apply-overlay.mjs` with the placeholders substituted, the guards vendored, the manifest stamped, the expiring-token flag and session columns checked, the Prisma datasource pointed at Postgres, `docs/README.md` and the first ADR written; verified by the docs-consistency test, `scripts/validate-manifest.mjs` and `scripts/smoke-guards.sh`; one local commit and the maintainer's checklist (remote, registration, hosting, database roles, secrets). `references/carry-over.md` covers code from an earlier attempt. See [Scaffolding](#scaffolding). |
| `dev-loop` (model-invocable) | Runs `shopify app dev` with the manifest's dev config and the bindings-file store, adds the sandbox port flag, ends every session with `app dev clean`, keeps theme work out of the app repo. `references/cli-traps.md` has the four CLI traps. |
| `admin-api` (model-invocable) | Guards GraphQL, webhook and toml changes: pin discipline, topic/handler parity, the companion's `shopify-dev` skill for schema verification when installed (unverified otherwise), throw on `userErrors`. References on version drift, webhooks, GraphQL errors on 200, metaobjects and `$app:`, one-way distribution. |
| `/shopify-app-kit:release [beta\|extension\|server]` | Opens the promotion PR (never merges), releases extensions with the deploy config and verifies the slug, explains the server release by push, scales to zero before migrating, warns before live billing, ends with a checklist. References on billing posture, migrations, CI posture. |
| `tripwire` (model-invocable) | Writes one offline test that fails when two files disagree and names the repair. References: the patterns worth copying, checks vs probes. |
| `docs-owner` (model-invocable) | Puts a fact in the one document that owns it, keeps reference docs undated, replaces warnings with checks, keeps CLAUDE.md under 200 lines with mechanics in path-scoped rules, shapes ADRs. |
| `tenancy` (model-invocable) | Tenant isolation keyed to `database.rls`, `auth.expiringOfflineTokens` and `paths.prisma`: fail-closed RLS with two database roles, the isolation canary and probe registry run as the runtime role, server-side tenant bootstrap with lazy provisioning, principal and append-only audit identity, one per-shop-locked refresh chokepoint for expiring offline tokens, the verify-record-process-mark webhook seam. |
| `mcp-connector` (model-invocable) | Building the app's own operator-facing MCP server (a product feature, never part of the kit): per-grant tokens hashed at rest with tenant-prefixed routing under RLS, OAuth with dynamic client registration and PKCE, the redirect-URI policy with loopback bypass, a tool manifest with a build-time parity check, per-token rate limits and budgets on billed calls, operator skills shipped from the app. |
| `classify` (model-invocable) | Cheap, high-speed classification (Jev / TypeSafe) as a capability the app adopts: one transport reading `TYPESAFE_API_KEY`, a `classify` manifest section that registers every label set and a per-tenant budget, a calibrated confidence the caller thresholds on to auto-act or escalate, and the operator MCP classify tool as the first call. Text-only; deterministic signals stay rules. |
| `templates/` | The repo shell a new app starts from: CI with migrate rehearsal and drift check, secret scanning from a checksum-verified binary, a dependency audit that opens issues, dependabot with framework majors ignored, the work-item issue template with the executor ladder, `.env.example` with public/secret/local markers, the docs map and its consistency test, the ADR shape and seed decisions, `.claude/` wiring (settings pin, bootstrap hook, starter manifest, rule seeds, CLAUDE.md). See [Scaffolding](#scaffolding). |
| `issue-filing` (model-invocable) | Files, triages or relabels a GitHub issue on the operating model: the label set from `labels.json`, one work-type label from the executor ladder, one priority, one ROI bucket, the "Close condition needs" block, bootstraps that name where a value goes and what they unlock, decisions with options, irreversible work routed to a human, CI-filed issues deduped on the title prefix. `references/rules.md` (the ten rules and the queue exemption) and `references/executor-ladder.md` (each rung, readiness, substitution). See [The operating layer](#the-operating-layer). |
| `labels.json` + `scripts/sync-labels.mjs` | The label set every consumer carries (eight work types, three priorities, five ROI buckets, gating and origin labels) with the `ladder` array, and the zero-dependency script that creates or updates them through `gh label create --force` (`--dry-run`, `--repo <owner>/<repo>`; never deletes). |
| `routines/` | The committed prompt texts of the scheduled Routines (`triage`, `nuclear-review`, `pr-steward`, `kit-health`, `graphify-refresh`, `dependency-wave`, `dev-parity`, `kit-tidy`), each with its cadence, environment, tools and boundaries, and `REGISTRY.md` with the table and the maintainer's `create_trigger` step. |
| `/shopify-app-kit:kit-dev` | Maintainer guide for this repo, including how to add a routine. |
| `lessons/INDEX.md` | One row per lesson extracted from the consumer apps, pointing at the reference file or agent section that owns it. See [Lessons](#lessons). |
| `schemas/shopify-app.v1.schema.json` | The manifest contract (JSON Schema, draft 2020-12). |

## Adopting the kit in an app repo

1. Pin the plugin from the repo's `.claude/settings.json`:

   ```json
   {
     "extraKnownMarketplaces": {
       "shopify-app-kit": {
         "source": { "source": "github", "repo": "loboroboticos/shopify-app-kit" }
       }
     },
     "enabledPlugins": {
       "shopify-app-kit@shopify-app-kit": true
     }
   }
   ```

   The repository is public, so the pin resolves from any session or CI without a token. A project pin registers the
   marketplace but does not install the plugin until `claude plugin install` has run once, so a consumer that runs in
   cloud sessions adds a repo-owned SessionStart hook (see a consumer's `.claude/hooks/kit-bootstrap.sh`) that installs
   it when absent; the vendored guards fire either way.

2. Write `.claude/shopify-app.json` (see the manifest contract below; start from
   `test/fixtures/manifests/npm-root-app.json` or `pnpm-root-app.json`).

3. Run `/shopify-app-kit:sync`. It copies `hooks/lib.sh` and `hooks/guard-*.sh` into `.claude/hooks/kit/`, sets
   `kit.version` in the manifest, and prints the `hooks.PreToolUse` snippet to add to `.claude/settings.json`
   (one entry per guard; the snippet is in `skills/sync/SKILL.md`, step 5). Guards are vendored on purpose: they
   fire from the consumer's own settings even when the plugin has not loaded (fresh clone, offline marketplace).
   The plugin's `hooks/hooks.json` registers only the SessionStart doctor.

4. Commit `.claude/shopify-app.json`, `.claude/hooks/kit/` and `.claude/settings.json`. Run `/shopify-app-kit:doctor`
   in a new session; it should report no drift.

## Scaffolding

A new app starts from the official template and then applies the kit's repo shell:

```bash
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

`templates/` holds everything the template does not give you: the verify gate that rehearses migrations from
an empty database and fails on schema drift, secret scanning from a version-pinned checksum-verified gitleaks
binary, a weekly dependency audit that opens an issue on a High or Critical finding, dependabot with framework
majors ignored, the work-item issue template whose "Close condition needs" ladder names who can close each item,
an `.env.example` that says which value is public, a docs map with the test that keeps it complete and undated,
the ADR shape and the seed decisions a new app takes before Phase 1, a `.claudeignore` that keeps `graphify-out/`
out of context, and the `.claude/` wiring (the marketplace pin, the remote-session bootstrap hook, a starter
manifest with expiring offline tokens, App Pricing and RLS Postgres, four path-scoped rule seeds, the four
vendored guards registered, a short CLAUDE.md). `templates/README.md` lists every file and every placeholder,
plus the gitleaks version and checksum; `test/templates.test.mjs` keeps the directory honest.

`/shopify-app-kit:new-app <app-name>` does the whole thing: the preconditions, `shopify app init` (or a clone
when init would need the maintainer's account), the overlay through `skills/new-app/scripts/apply-overlay.mjs`,
the edits a public app needs, verification, one local commit, and the maintainer's checklist for everything it
never creates (the GitHub repository, the registration, the hosting app, the database, secrets). `--dry-run <dir>`
stops before the commit. The steps and the merge rules are the skill's own (`skills/new-app/SKILL.md` and its
references); this README does not repeat them.

Upgrading: bump nothing in the consumer, just re-run `/shopify-app-kit:sync` after the kit tags a new version.
The doctor flags hook headers whose `# shopify-app-kit vX.Y.Z` line no longer matches `kit.version`. Point the
manifest's optional `$schema` at the newest tag
(`https://raw.githubusercontent.com/loboroboticos/shopify-app-kit/v<version>/schemas/shopify-app.v1.schema.json`).

Tags are created by `.github/workflows/release-tag.yml` when a version bump merges to `main`; nobody pushes a
kit tag by hand (see [Developing the kit](#developing-the-kit)).

## Companion plugins

The kit has two companions. The first is Shopify's official `shopify-ai-toolkit` plugin:

```bash
claude plugin install shopify-ai-toolkit@claude-plugins-official
```

It covers what the platform does: Admin API docs and schema search with GraphQL validation (`shopify-dev`),
the Admin API and custom data (`shopify-admin`, `shopify-custom-data`), pricing (`shopify-app-pricing`), the
pre-submission compliance check (`shopify-app-store-review`), the CLI reference (`shopify-use-shopify-cli`),
Polaris for the app home (`shopify-polaris-app-home`) and a score of other skills. Its hooks are telemetry
only; the opt-out is the file `~/.config/shopify-ai-toolkit/opt-out`.

The kit covers what the companion cannot know: this repo's manifest facts and the guard hooks that enforce
them, the doctor, the review roster and the `pre-pr-review`, `release-readiness` and `plan-review` workflows,
the lessons, the scaffold and its templates, and the app-layered Shopify data (app-owned metafields and
metaobjects, the `$app:` accessors, the entitlement write path and its cache contract). A kit skill calls the companion for platform facts and says
"unverified" without it: `admin-api` step 4 uses `shopify-dev` for schema verification, `dev-loop` points at
`shopify-use-shopify-cli` for the CLI reference, `release` runs `shopify-app-store-review` before the promotion
PR of a public app. The doctor warns once when the companion is not installed and notes once while telemetry is
on; it never blocks. In a consumer scaffolded from `templates/`, `.claude/hooks/kit-bootstrap.sh` installs both
plugins in a remote session and writes the opt-out. `skills/doctor/references/companion.md` is the home of the
split (lesson `kit-1`).

The second is [graphify](https://github.com/Graphify-Labs/graphify) (MIT), a Claude Code skill that turns a
codebase into a queryable knowledge graph and writes `graphify-out/` (`graph.html`, `GRAPH_REPORT.md`,
`graph.json`, a content-hash cache). It is not a plugin: its README installs the PyPI package `graphifyy` (the
CLI and the skill command are `graphify`) and `graphify install` then registers the skill under
`~/.claude/skills/graphify/`:

```bash
pip install graphifyy==0.9.65 && graphify install     # or: uv tool install graphifyy==0.9.65 / pipx install graphifyy==0.9.65
```

It covers the map: what connects to what, the god nodes, `/graphify query` over a repo in far fewer tokens than
reading it. The kit covers the convention around it: the `graphify-refresh` routine rebuilds the graph weekly
and commits `graphify-out/` on the `graph/` branch only (force-with-lease on that branch, never the default
branch), so every session can start from a current map; `graphify-out/` is listed in the templates'
`.claudeignore` and belongs in the consumer's `.gitignore`, so a local rebuild neither lands on the default
branch nor invalidates the prompt cache. The bootstrap hook installs it pinned to the release above (the same
pin the doctor names); the doctor warns once when it is absent; the routine skips without it (lesson `kit-2`).

## The manifest contract

`.claude/shopify-app.json`, schema v1. The top level is closed (`additionalProperties: false`); sections grow
additively. Required sections: `kit`, `app`, `shopifyCli`, `branches`, `packageManagers`. Two optional metadata keys
are also allowed at the top level: `$schema` (a URL to this schema, for editors) and `$comment` (a free-text note);
the hooks ignore both.

```json
{
  "kit": { "schemaVersion": 1, "version": "0.1.0" },
  "app": { "name": "Example App", "kind": "embedded-app", "handles": { "prod": "example-app", "dev": "example-app-dev-1" } },
  "shopifyCli": {
    "configs": { "dev": "example-dev", "deploy": "example" },
    "requireConfigFlag": true,
    "devPolicy": "config-required",
    "deployPolicy": "config-required",
    "configUsePolicy": "allowed",
    "themeDevFromRoot": "block"
  },
  "branches": { "default": "beta", "protected": ["main"], "promotion": { "from": "beta", "to": "main" } },
  "packageManagers": { ".": "npm", "web": "pnpm" },
  "paths": { "server": "web", "shopifyServer": "web/app/shopify.server.ts", "appTomls": ["shopify.app.example.toml"] },
  "apiVersion": { "expected": "2026-07", "pins": ["web/app/shopify.server.ts"] },
  "webhooks": { "topics": ["app/uninstalled", "app/scopes_update"], "compliance": true },
  "scopes": { "required": ["read_products"], "optional": [] },
  "deploy": { "targets": { "prod": { "fly": "example-app", "flyToml": "web/fly.toml", "workflow": "deploy.yml" } }, "protectedWorkflows": ["deploy.yml"] },
  "billing": { "live": true, "testFlag": "BILLING_TEST", "method": "app-pricing" },
  "auth": { "expiringOfflineTokens": true },
  "database": { "provider": "prisma-postgres", "rls": false },
  "docs": { "adrDir": "docs/adr", "mapFile": "README.md", "mapHeading": "## Docs map" },
  "checks": { "tripwireDir": "test/claude" }
}
```

Keys the hooks read:

| Key | Values | Effect |
| --- | --- | --- |
| `kit.schemaVersion` | `1` | Guards refuse to run (fail closed) unless this is `1`. |
| `kit.version` | string or `null` | Set by `sync`; compared with the vendored hooks' headers. |
| `shopifyCli.devPolicy` | `config-required` / `operator-only` / `allowed` | `shopify app dev [clean]` must carry `--config <configs.dev>` / is blocked outright / passes. |
| `shopifyCli.deployPolicy` | same enum | `shopify app deploy` must carry `--config <configs.deploy>` / is blocked outright / passes. `npm|pnpm|yarn|bun run deploy` (and `pnpm deploy`) is blocked unless `allowed`. |
| `shopifyCli.configUsePolicy` | same enum | `shopify app config use X`: X must be a manifest config / blocked outright / passes. |
| `shopifyCli.configs.{dev,deploy}` | config names | Required when the matching policy is `config-required`. A `--config` value that differs from the manifest is blocked: a wrong config is worse than a missing one. |
| `shopifyCli.themeDevFromRoot` | `block` / `allow` | `shopify theme dev` whose effective directory (after `cd` / `--path`) is the repo root is blocked. A `cd` to a non-literal path before it fails closed. |
| `branches.protected` | non-empty array | `git push` to one of these (explicit refspec, `--all`/`--mirror`, or an implicit/`HEAD` push from a checkout on one), `gh pr merge` into one, `gh pr edit --base` onto one, and `gh api` writes to `pulls/<n>/merge`, `/merges`, `git/refs/heads/<branch>` or a `mergePullRequest` mutation are blocked. An empty array fails closed. |
| `branches.default`, `branches.promotion` | branch name; `{ from, to }` or `null` | Only quoted in the block message: "Target `<default>` instead; Claude may open a `<from> -> <to>` promotion PR when asked, never merge it." `gh pr create --base <protected>` is allowed for exactly that. |
| `deploy.protectedWorkflows` | workflow file names | `gh workflow run` of one of these is blocked, matched by file name, by `.github/workflows/<file>`, or by the workflow's `name:` read from the consumer's `.github/workflows/<file>`. |
| `packageManagers` | `{ "<dir>": "npm" \| "pnpm" }` | `pnpm …` in a directory mapped to `npm`, and `npm install\|ci\|i\|add\|update\|uninstall\|run …` in a directory mapped to `pnpm`, are blocked. The directory is the effective one after `cd`/`pushd`/`popd`, `pnpm -C`/`--dir` or `npm --prefix`, looked up as an exact repo-relative entry (`"."` = root); unmapped directories are left alone (no nearest-ancestor lookup yet). A `cd` to a non-literal path before a guarded command fails closed. |
| `deploy.scaleToZeroBeforeMigrate` | boolean | `guard-migrations`: an allowed `prisma migrate deploy` prints one reminder line (scale the app to zero before migrating, per the `release` skill's `migrations-and-zero-downtime.md`) when this is `true`; nothing is blocked on it. `release-readiness` notes it under the migrations dimension. |
| `paths.prisma`, `database.provider`, `database.sharedDevDbWithBeta` | repo-relative path; string; boolean | `guard-migrations` blocks `prisma migrate reset`, `prisma db push --force-reset` / `--accept-data-loss` and a `prisma db execute` carrying `DROP DATABASE`, `DROP SCHEMA` or `TRUNCATE` whatever these say; the block message quotes them so the session knows which database the checkout reaches. `release-readiness` runs its migrations dimension only when the range touches `paths.prisma`. |

Keys the doctor prints and the skills and review agents read (no guard behaviour):

| Key | Values | Read by |
| --- | --- | --- |
| `auth.expiringOfflineTokens` | boolean | The app runs `future.expiringOfflineAccessTokens` and its session table carries `refreshToken` and `refreshTokenExpires`. Required by Shopify for public apps created on or after 2026-04-01 and for all public apps from 2027-01-01 (60-minute access token, 90-day refresh token, one live refreshable token per app per store). `doctor` prints it; `tenancy` and `prisma-migration-reviewer` check the flag and the columns. |
| `billing.method` | `billing-api` / `app-pricing` / `none` | App Pricing (the successor of Managed Pricing) is the default for public apps and public-apps-only, delivers no subscription webhooks (status comes from the Partner Active Subscription API); the Billing API is legacy but functional and the only path for custom distribution. `doctor` prints it; `release` and the billing rule seed read it. |
| `docs.adrDir`, `docs.mapFile`, `docs.mapHeading` | repo-relative paths and a heading | Where the ADR series and the docs map live; `docs-owner` and the templates' `docs-consistency` test read them. |
| `classify.provider`, `classify.labelSets`, `classify.budget`, `classify.defaultEscalateThreshold` | `jev`; a label-set registry; a per-tenant `monthlyCap`; a 0..1 floor | How the app calls a classifier: the `classify` skill reads the section, `classifier-reviewer` checks each call names a declared label set, is budgeted and gated on confidence. Absent means the app classifies nothing. |

`operator-only` blocks tell the session to ask the maintainer to run the command from their terminal.
Block messages start with `Blocked by shopify-app-kit/<hook>:` and end with
`Cases: shopify-app-kit test/hooks.test.mjs (vX.Y.Z).` so a consumer can trace any block to a test case.

Manifest lookup order: `$SHOPIFY_APP_KIT_MANIFEST`, then `$CLAUDE_PROJECT_DIR/.claude/shopify-app.json`, then the
nearest `.claude/shopify-app.json` walking up from the command's working directory. The consumer root is the
manifest's grandparent (or `$SHOPIFY_APP_KIT_ROOT` / `$CLAUDE_PROJECT_DIR` when the manifest lives elsewhere).

## Reviewing a branch

`/shopify-app-kit:review [base | PR number]` picks the base from the manifest (`branches.default`, or
`promotion.to` when you are on the promotion branch), gathers the diff, and launches `review-correctness` and
`review-quality` (plus `classifier-reviewer` when the manifest declares `classify`) in parallel with the manifest,
diff and changed files in their prompts. Each returns prioritized
findings with file:line evidence; the skill dedupes them and reports one verdict (`block`, `changes-needed`,
`approve`) with a per-section manifest checklist. The agents are read-only and never post to the PR unless asked.

The manifest is what makes the review specific: the correctness agent knows which files must pin
`apiVersion.expected`, which webhook topics need handlers, which scopes are allowed, whether billing is live,
whether queries must be shop-scoped by hand, and which workflows are protected. The quality agent knows where the
app's canonical layers live and what file-size limit `checks.fileSize` enforces. Sections missing from the manifest
are skipped, and without a manifest the review runs in generic mode.

### Review roster

Beyond the two agents the `review` skill launches, the kit ships a roster of single-lens reviewers, each read-only,
each reporting findings on one shape (`blocker | major | minor | note`, a one-line claim, `file:line` or plan-section
evidence, a proposed fix) so a later pass can dedupe them. Every one reads `.claude/shopify-app.json` first and works
from a plan file or PR description plus the diff against `origin/<branches.default>`, so "review this branch" and a
checkout are enough to launch it (`subagent_type: "shopify-app-kit:<name>"`).

- **Before building, on a plan:** `design-review-architecture`, `design-review-feasibility`,
  `design-review-product-intent`, `design-review-risk-governance`. Is the plan sound, buildable, the right thing, safe.
  `/shopify-app-kit:plan-review` runs all four and merges the findings.
- **Before a PR, on a diff:** `qa-review-security-governance`, `qa-review-spec-conformance`,
  `qa-review-technical-integrity`, `qa-review-usability`, `qa-review-divergence-hunter`, plus the two stack reviewers
  `prisma-migration-reviewer` and `storefront-extension-reviewer`. `/shopify-app-kit:pre-pr-review` runs them.
- **Before a promotion PR, on the range:** `/shopify-app-kit:release-readiness` runs one dimension per manifest
  section (API version, webhooks, migrations, branch model, billing, extensions, App Store review), each as one of
  the agents above, and returns a verdict with the PR-body checklist.
- **`/shopify-app-kit:review`** still launches `review-correctness` and `review-quality`; Shopify Admin API coverage
  (version pins, webhook parity, scopes, compliance, billing, `userErrors`, session tokens) stays in
  `review-correctness`.

The `design-review-*` and `qa-review-*` personas are ported from the
[Engine template](https://github.com/StarshipSuperjam/engine-template) with its orchestrator, packets and memory
servers rewritten into the plan file, the PR description, the diff and the manifest (see `CHANGELOG.md` for the
port rules).

### The pre-pr-review workflow

`/shopify-app-kit:pre-pr-review [base | { "base", "pr", "reviewers", "all" }]` runs the diff-stage roster in one
go (`workflows/pre-pr-review.js`, plain JavaScript loaded from the plugin): one cheap scoping agent picks the base
the way the review skill does and lists the changed files; the roster runs in parallel (the stack reviewers only
when the diff touches their files; `all: true` forces both); findings on the same file within three lines, or on
the same section when there is no file, merge into one; each blocker and major (up to twelve, the rest reported
unverified) goes to a read-only skeptic, and a refuted finding stays as a `note` with the reason; the verdict is
`block` on a surviving blocker, `changes-needed` on a major or a reviewer that returned nothing, else `approve`.
Nothing is posted to the PR and no file is modified.

### The release-readiness and plan-review workflows

`/shopify-app-kit:release-readiness [{ "base", "head", "pr", "dimensions" }]` has the same three-phase shape,
applied to the promotion range (`branches.promotion.from` against `.to`, or the arguments). Only the dimensions
the manifest enables run, each as one read-only kit agent: `api-version` (every pin file and toml carries
`apiVersion.expected`), `webhooks` (every subscription has a handler; compliance handlers present), `migrations`
(only when the range touches `paths.prisma`: no destructive operation without a PR-body acknowledgement),
`branch-model` (the range is exactly the promotion pair; protected workflows untouched or reviewed), `billing`
(only when `billing.live`: no tier, price or name change without it being called out), `extension` (only when
`paths.extensions` is non-empty) and `app-store-review` (a public app: one note to run the companion's
`shopify-app-store-review` skill; no agent). The verdict is `no-go` on a surviving blocker, `go` only when every
dimension ran clean, else `go-with-notes`; the result carries the release checklist for the promotion PR body,
ticked where a dimension passed or does not apply. The `release` skill runs it before opening the promotion PR.

`/shopify-app-kit:plan-review <plan file | PR number | #issue | { "plan", "pr", "issue", "reviewers" }>` runs the
four `design-review-*` agents on a plan that has not been built, with the manifest facts it touches and the ADR
directory in their prompts; findings on the same section merge into one carrying both claims; the verdict is
`rethink` on a surviving blocker, `revise` on a major or an uncovered lens, else `sound`, and the decisions the
plan should record as ADRs (findings tagged `adr: true`) are listed separately.

## Lessons

`lessons/INDEX.md` is a table with one row per lesson the consumer apps taught the kit: an id, a one-line rule,
its class (`rule`, `recipe`, `lens` or `adr-seed`), its home (the section of a skill reference file or review
agent that owns the text) and its source (`app-1`, `app-2`, `app-3`, the neutral labels defined in
`lessons/README.md`). The index never carries the text; the home does. A row stays in the live table only while
something a session reads cites its id (a skill step, an agent, a template rule seed, a workflow, a routine
prompt); rows nothing cites sit in the index's History section with the reason, and a new lesson enters with
its citation. `lessons/README.md` has the extraction discipline; `test/lessons-index.test.mjs` keeps it honest.

## The operating layer

GitHub issues are the only work queue, for agents and humans alike; nothing writes to a project board. Every
issue carries exactly one **work-type label** from the executor ladder, one priority and one ROI bucket, and its
body says what closing it needs. Scheduled Claude Code Routines are the workforce.

- **`labels.json`** is the label set: `code only` (a PR closes it), the agent rungs `agent:ci` (an Actions
  workflow with the repo's existing secrets), `agent:cloud` (reaches the store, no login) and `agent:local` (the
  maintainer's logged-in machine), the human rungs `human:bootstrap` (a one-time maintainer action whose Unlocks
  become agent work), `human:decision` (answered by a `decision:` comment), `human:account` and `human:legal`;
  `p1`/`p2`/`p3`; `roi:5`…`roi:1`; `launch-gate`, `blocked`, `deploy`; `qa`, `dependencies`, `bug`,
  `documentation`. Its `ladder` array is the executor order. `node scripts/sync-labels.mjs [--repo <owner>/<repo>]
  [--dry-run]` creates or updates them with `gh label create --force` and never deletes one.
- **`issue-filing`** (model-invocable) applies the ten rules in `skills/issue-filing/references/rules.md`: the
  least-privileged executor that can close it (R1), a "Close condition needs" line or no label (R2), decompose
  at filing (R3), bootstraps titled `Bootstrap: <what> → <where>` that name where a value goes and what they
  unlock (R4), decisions with options and a reversible default (R5), irreversibility beats the ladder (R6),
  agents never close a `human:*` issue (R7), score in the same pass (R8), CI-filed issues deduped on the title
  prefix with no traces attached (R9), no secret in an issue (R10). One pinned "maintainer's queue" issue is
  the tracking surface the triage routine rewrites; it carries no work type, priority or ROI.
- **`routines/`** holds the prompt texts, one file each with cadence, environment, tools, what it may touch and
  what it never does, then the prompt verbatim: `triage` (weekly: lint, decisions, closed bootstraps, stale
  scheduled workflows, re-score, rewrite the queue issue), `nuclear-review` (weekly: the `review` skill over
  the week's merged diff, findings filed as issues, never a PR), `pr-steward` (daily: agent-owned PRs driven to
  green, never merged), `kit-health` (monthly: the doctor, the kit version against the latest tag, the API
  version's support window, library majors across the portfolio), `graphify-refresh` (weekly: `graphify-out/`
  on the `graph/` branch), `dependency-wave` (weekly: High/Critical advisories and deferred majors in one
  issue), `dev-parity` (weekly, only where the manifest has a beta target and a dev config: the paired configs,
  the beta deploys, each host's readiness, the monthly human checklist), `kit-tidy` (weekly, on the kit itself:
  duplicated prose, things nothing reads, the size trend, docs that restate a test, the portfolio's kit
  versions; one PR of mechanical drift). Every consumer prompt reads `.claude/shopify-app.json` and `labels.json`
  first, derives the repo from the git remote, never closes a `human:*` issue, never dispatches a workflow in
  `deploy.protectedWorkflows`, and opens at most one PR per run. `routines/REGISTRY.md` has the table and the
  maintainer's step: one `create_trigger` call per routine per repo with `create_new_session_on_fire: true`.
- **The portfolio is discovered, never listed.** Each consumer's manifest declares `kit.portfolioId` (an opaque
  id, never a name) and `kit.routines`; a cross-repo routine lists the repositories under the remote's owner it
  can read and keeps the ones carrying the id. Nothing private is written anywhere in the kit.

`test/labels.test.mjs` and `test/routines.test.mjs` keep the set and the prompts in shape.

## The three-plugin rule

Each app has up to three plugins, and they never mix:

1. **This kit** (developer-facing): guard hooks, skills, review agents used by sessions that write the app's code.
   Generic, versioned, shared across apps.
2. **The app's operator plugin** (a separate repo per app): what the app's operator runs day to day. It may embed
   store-specific facts; the kit must not.
3. **The app repo's own `.claude/`**: the manifest, the vendored guards, repo-local skills and tripwires.

A test (`test/no-repo-literals.test.mjs`) fails the kit's CI on store handles, client ids, hosting app names or
business names, so operator or repo facts cannot leak into the kit.

## Developing the kit

```bash
node --test "test/**/*.test.mjs"     # or: npm test
claude plugin validate . --strict
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate skills --strict
claude --plugin-dir .                # /shopify-app-kit:doctor should be listed
```

See `/shopify-app-kit:kit-dev` (skills/kit-dev/SKILL.md) for how to add hooks, skills, agents and lessons, and
how to release. Any change under `skills/`, `agents/`, `hooks/`, `workflows/`, `schemas/`, `lessons/`
or `.claude-plugin/` needs a version bump; CI checks it on PRs to `main`.

Releases are tagged on merge: `.github/workflows/release-tag.yml` runs on every push to `main`, reads the version
from `.claude-plugin/plugin.json`, creates the annotated tag `v<version>` if it does not exist, and publishes a
GitHub Release whose notes are that version's `CHANGELOG.md` section. Never push a kit tag by hand.

## License

MIT (see `LICENSE`). The two review agents are adapted from Cursor's Thermos plugin, also MIT; its notice is
reproduced in the third-party section of `LICENSE`.
