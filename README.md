# shopify-app-kit

A Claude Code plugin for developer sessions that build Shopify apps. It ships generic tooling only: guard hooks
that read a per-repo manifest, skills, and (later) review agents and workflows. Nothing in this repo knows about
any particular app, store or hosting account; every repo-specific fact lives in the consumer's
`.claude/shopify-app.json`.

The repo root is the plugin root and its own marketplace.

## What you get

| Component | What it does |
| --- | --- |
| `/shopify-app-kit:review` | Deep pre-merge review: the two agents below run in parallel on the branch diff, each checking it against the manifest, and the skill synthesizes one verdict. |
| `agents/review-correctness.md` | Bugs, breakage, security and devex, plus every manifest contract: auth boundaries, API version pins, webhook coverage and compliance, scopes, CLI configs, protected workflows, billing test flag, shop-scoped queries and migrations. |
| `agents/review-quality.md` | Harsh maintainability review against the app's canonical layers (Shopify server module, thin routes, one GraphQL home, per-topic webhooks, shop-scoped data layer), file-size limit from `checks.fileSize`, spaghetti growth, code-judo simplifications. |
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
| `hooks/guard-shopify-cli.sh` | PreToolUse guard for `shopify app dev`, `shopify app deploy`, `shopify app config use`, `<pm> run deploy` and `shopify theme dev`, driven by the manifest's `shopifyCli` policies. Fails closed when the manifest or `jq` is missing. |
| `hooks/guard-protected-branch.sh` | PreToolUse guard for `git push`, `gh pr merge`, `gh pr edit --base`, `gh api` writes and `gh workflow run`, driven by `branches.protected` and `deploy.protectedWorkflows`. Lets the session open a promotion PR, never land one. Fails closed when the manifest, `jq` or a PR's base cannot be read. |
| `hooks/guard-package-manager.sh` | PreToolUse guard that keeps `pnpm` and `npm` in the directories `packageManagers` maps them to (exact entry; effective directory after `cd`, `pnpm -C`, `npm --prefix`). Fails closed when the manifest or `jq` is missing. |
| `hooks/lib.sh` | Shared bash the guards source: manifest resolution, block messages, path normalisation, heredoc stripping, command splitting with `cd` tracking. |
| `hooks/doctor.sh` | SessionStart briefing: validates the manifest structurally, prints the app facts, reports vendored-hook drift. Silent in repos without a manifest. |
| `/shopify-app-kit:doctor` | Same checks, on demand, plus settings-registration drift. |
| `/shopify-app-kit:sync` | Vendors the guards into the consumer and records the kit version in the manifest. |
| `dev-loop` (model-invocable) | Runs `shopify app dev` with the manifest's dev config and the bindings-file store, adds the sandbox port flag, ends every session with `app dev clean`, keeps theme work out of the app repo. `references/cli-traps.md` has the four CLI traps. |
| `admin-api` (model-invocable) | Guards GraphQL, webhook and toml changes: pin discipline, topic/handler parity, the Shopify Dev MCP when configured, throw on `userErrors`. References on version drift, webhooks, GraphQL errors on 200, metaobjects and `$app:`, one-way distribution. |
| `/shopify-app-kit:release [beta\|extension\|server]` | Opens the promotion PR (never merges), releases extensions with the deploy config and verifies the slug, explains the server release by push, scales to zero before migrating, warns before live billing, ends with a checklist. References on billing posture, migrations, CI posture. |
| `tripwire` (model-invocable) | Writes one offline test that fails when two files disagree and names the repair. References: the patterns worth copying, checks vs probes. |
| `docs-owner` (model-invocable) | Puts a fact in the one document that owns it, keeps reference docs undated, replaces warnings with checks, keeps CLAUDE.md under 200 lines with mechanics in path-scoped rules, shapes ADRs. |
| `tenancy` (model-invocable) | Tenant isolation keyed to `database.rls`, `auth.expiringOfflineTokens` and `paths.prisma`: fail-closed RLS with two database roles, the isolation canary and probe registry run as the runtime role, server-side tenant bootstrap with lazy provisioning, principal and append-only audit identity, one per-shop-locked refresh chokepoint for expiring offline tokens, the verify-record-process-mark webhook seam. Six references. |
| `mcp-connector` (model-invocable) | Building the app's own operator-facing MCP server (a product feature, never part of the kit): per-grant tokens hashed at rest with tenant-prefixed routing under RLS, OAuth with dynamic client registration and PKCE, the redirect-URI policy with loopback bypass, a tool manifest with a build-time parity check, per-token rate limits and budgets on billed calls, operator skills shipped from the app. Six references. |
| `templates/` | The repo shell a new app starts from: CI with migrate rehearsal and drift check, secret scanning from a checksum-verified binary, a dependency audit that opens issues, dependabot with framework majors ignored, the work-item issue template with the executor ladder, `.env.example` with public/secret/local markers, the docs map and its consistency test, the ADR shape and seed decisions, `.claude/` wiring (settings pin, bootstrap hook, starter manifest, rule seeds, CLAUDE.md). See [Scaffolding](#scaffolding). |
| `/shopify-app-kit:kit-dev` | Maintainer guide for this repo. |
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
   `kit.version` in the manifest, and prints the `hooks.PreToolUse` snippet to add to `.claude/settings.json`:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-shopify-cli.sh\"" },
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-protected-branch.sh\"" },
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-package-manager.sh\"" }
           ]
         }
       ]
     }
   }
   ```

   Guards are vendored on purpose: they fire from the consumer's own settings even when the plugin has not
   loaded (fresh clone, offline marketplace). The plugin's `hooks/hooks.json` registers only the SessionStart doctor.

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
the ADR shape and the seed decisions a new app takes before Phase 1, and the `.claude/` wiring (the marketplace
pin, the remote-session bootstrap hook, a starter manifest with expiring offline tokens, App Pricing and RLS
Postgres, four path-scoped rule seeds, a short CLAUDE.md). `templates/README.md` lists every file and the
placeholders (`{{APP_NAME}}`, `{{DEFAULT_BRANCH}}`, `{{PROTECTED_BRANCH}}`, `{{PACKAGE_MANAGER}}`,
`{{SERVER_DIR}}`, plus the gitleaks version and checksum). The `new-app` skill (next version) applies them after
`shopify app init` and substitutes the placeholders; until then copy the files and substitute by hand.
`test/templates.test.mjs` keeps the directory honest.

Upgrading: bump nothing in the consumer, just re-run `/shopify-app-kit:sync` after the kit tags a new version.
The doctor flags hook headers whose `# shopify-app-kit vX.Y.Z` line no longer matches `kit.version`. Point the
manifest's optional `$schema` at the newest tag
(`https://raw.githubusercontent.com/loboroboticos/shopify-app-kit/v<version>/schemas/shopify-app.v1.schema.json`).

Tags are created by `.github/workflows/release-tag.yml` when a version bump merges to `main`; nobody pushes a
kit tag by hand (see [Developing the kit](#developing-the-kit)).

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

Keys the doctor prints and the skills and review agents read (no guard behaviour):

| Key | Values | Read by |
| --- | --- | --- |
| `auth.expiringOfflineTokens` | boolean | The app runs `future.expiringOfflineAccessTokens` and its session table carries `refreshToken` and `refreshTokenExpires`. Required by Shopify for public apps created on or after 2026-04-01 and for all public apps from 2027-01-01 (60-minute access token, 90-day refresh token, one live refreshable token per app per store). `doctor` prints it; `tenancy` and `prisma-migration-reviewer` check the flag and the columns. |
| `billing.method` | `billing-api` / `app-pricing` / `none` | App Pricing (the successor of Managed Pricing) is the default for public apps and public-apps-only, delivers no subscription webhooks (status comes from the Partner Active Subscription API); the Billing API is legacy but functional and the only path for custom distribution. `doctor` prints it; `release` and the billing rule seed read it. |
| `docs.adrDir`, `docs.mapFile`, `docs.mapHeading` | repo-relative paths and a heading | Where the ADR series and the docs map live; `docs-owner` and the templates' `docs-consistency` test read them. |

`operator-only` blocks tell the session to ask the maintainer to run the command from their terminal.
Block messages start with `Blocked by shopify-app-kit/<hook>:` and end with
`Cases: shopify-app-kit test/hooks.test.mjs (vX.Y.Z).` so a consumer can trace any block to a test case.

Manifest lookup order: `$SHOPIFY_APP_KIT_MANIFEST`, then `$CLAUDE_PROJECT_DIR/.claude/shopify-app.json`, then the
nearest `.claude/shopify-app.json` walking up from the command's working directory. The consumer root is the
manifest's grandparent (or `$SHOPIFY_APP_KIT_ROOT` / `$CLAUDE_PROJECT_DIR` when the manifest lives elsewhere).

## Reviewing a branch

`/shopify-app-kit:review [base | PR number]` picks the base from the manifest (`branches.default`, or
`promotion.to` when you are on the promotion branch), gathers the diff, and launches `review-correctness` and
`review-quality` in parallel with the manifest, diff and changed files in their prompts. Each returns prioritized
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
- **Before a PR, on a diff:** `qa-review-security-governance`, `qa-review-spec-conformance`,
  `qa-review-technical-integrity`, `qa-review-usability`, `qa-review-divergence-hunter`, plus the two stack reviewers
  `prisma-migration-reviewer` and `storefront-extension-reviewer`.
- **`/shopify-app-kit:review`** still launches `review-correctness` and `review-quality`; Shopify Admin API coverage
  (version pins, webhook parity, scopes, compliance, billing, `userErrors`, session tokens) stays in
  `review-correctness`.

The nine `design-review-*` and `qa-review-*` personas are ported from the
[Engine template](https://github.com/StarshipSuperjam/engine-template) with its orchestrator, packets and memory
servers rewritten into the plan file, the PR description, the diff and the manifest (see `CHANGELOG.md` for the
port rules).

### The pre-pr-review workflow

`/shopify-app-kit:pre-pr-review [base | { "base", "pr", "reviewers", "all" }]` runs the diff-stage roster in one
go. It is a Claude Code workflow script (`workflows/pre-pr-review.js`, plain JavaScript loaded from the plugin):

1. **Scope.** One cheap agent reads the manifest, picks the base the way the review skill does (argument, then the
   PR's base, then `promotion.to` from the promotion branch, then `branches.default`, then `main`), lists the
   changed files, and takes the intent from the PR body or a plan file the branch adds.
2. **Review.** The five `qa-review-*` agents run in parallel; `prisma-migration-reviewer` runs when the diff touches
   `paths.prisma`, a `schema.prisma` or a migrations directory, and `storefront-extension-reviewer` when
   `paths.extensions` is declared and touched (`all: true` forces both). Every reviewer returns findings on the
   shared shape. Skipped reviewers and reviewers that return nothing are listed, never silently dropped.
3. **Dedupe.** Findings on the same file within three lines, or on the same section when there is no file, merge
   into one carrying the highest severity and every reviewer that raised it.
4. **Verify.** Each blocker and major (up to twelve; the rest are reported unverified) goes to a read-only skeptic
   that tries to refute it. A refuted finding is kept as a `note` with the reason, so the operator sees what was
   argued away.
5. **Verdict.** `block` on a surviving blocker, `changes-needed` on a major, else `approve`; the launching session
   reports it. Nothing is posted to the PR and no file is modified.

## Lessons

`lessons/INDEX.md` is a table with one row per lesson the consumer apps taught the kit: an id, a one-line rule,
its class (`rule`, `recipe`, `lens` or `adr-seed`), its home (the section of a skill reference file or review
agent that owns the text) and its source (`app-1`, `app-2`, `app-3`, the neutral labels defined in
`lessons/README.md`). The index never carries the text; the home does. A consumer seeds its `.claude/rules/*.md`
from the `rule` rows and points back; `recipe` rows run through the owning skill; `lens` rows are already in the
review agents; `adr-seed` rows are decisions a new app writes one ADR each for. `lessons/README.md` has the
extraction discipline and how to add a lesson; `test/lessons-index.test.mjs` keeps the index honest.

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
claude --plugin-dir .                # /shopify-app-kit:doctor should be listed
```

See `/shopify-app-kit:kit-dev` (skills/kit-dev/SKILL.md) for how to add hooks, skills, agents and lessons, and
how to release. Any change under `skills/`, `agents/`, `hooks/`, `workflows/`, `schemas/`, `lessons/`, `.mcp.json`
or `.claude-plugin/` needs a version bump; CI checks it on PRs to `main`.

Releases are tagged on merge: `.github/workflows/release-tag.yml` runs on every push to `main`, reads the version
from `.claude-plugin/plugin.json`, creates the annotated tag `v<version>` if it does not exist, and publishes a
GitHub Release whose notes are that version's `CHANGELOG.md` section. Never push a kit tag by hand.

## License

MIT (see `LICENSE`). The two review agents are adapted from Cursor's Thermos plugin, also MIT; its notice is
reproduced in the third-party section of `LICENSE`.
