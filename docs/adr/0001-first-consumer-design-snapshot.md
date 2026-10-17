# 0001. The first consumer's design snapshot

**Snapshot of the 2026-09-20 design; where a skill or the schema disagrees, the skill wins.**

- Status: accepted (a snapshot, harvested 2026-10-17 for kit 0.18.0)
- Context: the first consumer planned this kit in a design document of its own. That document leaves the
  consumer once it syncs 0.18.0, so the four sections that still explain why the kit is shaped as it is are kept
  here, generalised: other consumer apps are "a second consumer app", consumer issue numbers and paths give way to
  the mechanism they named, and sections that were not kept are not referenced. Later releases changed some
  details; the skills, the hooks' tests and the schema are the current rule, this record is the reasoning.

## Hooks

Shared set: bash, `set -uo pipefail`, `input="$(cat)"`, jq with a no-jq fallback, heredoc stripping, "defence in
depth against a mistake, not a security boundary", exit 2 with the reason, the rule and the case reference.
Manifest resolution: `$SHOPIFY_APP_KIT_MANIFEST` (tests), then `$CLAUDE_PROJECT_DIR/.claude/shopify-app.json`, then
a walk up from `cwd`. Fail closed on a missing jq, a missing manifest or an unknown `schemaVersion`, only for the
guarded command classes.

- `guard-shopify-cli.sh`: `app dev` per `devPolicy` (config-required checks the `--config` value, a strengthening
  of a presence check); `app deploy` per `deployPolicy` (operator-only blocks outright: the maintainer runs it from
  their own terminal); `app config use` per `configUsePolicy`; `<pm> run deploy` blocked unless allowed;
  `theme dev` from the repo root per `themeDevFromRoot` (`--path` and `cd` aware).
- `guard-package-manager.sh`: nearest-ancestor lookup in `packageManagers`; `pnpm` in an npm directory and
  `npm install|ci|add|run|…` in a pnpm directory both block; `npx` is allowed everywhere.
- `guard-protected-branch.sh`: a loop over `branches.protected`, workflows from `deploy.protectedWorkflows`, rule
  text from `branches.default` and `branches.promotion`; PR base resolution stays fail-closed.
- `guard-migrations.sh`: blocks `prisma migrate reset` and `db push --force-reset|--accept-data-loss`; an allowed
  `migrate deploy` prints the `deploy.scaleToZeroBeforeMigrate` reminder from the guard itself.
- `doctor.sh`: SessionStart through the plugin's `hooks.json`, additional context only.

**Guards are vendored, not plugin-registered.** `/shopify-app-kit:sync` copies `lib.sh` and `guard-*.sh` into
`.claude/hooks/kit/` and each repo's own `settings.json` registers them. Reasons: a guard must fire when the plugin
has not loaded (the remote first-session gap); one code path means no double block messages; the repo's own
tripwire proves registration and version in CI without network. It is the vendor-and-tripwire pattern a consumer
already used for generated assets, applied to hooks. A consumer ran its old guards beside the new ones until every
case of the old ones had a passing harness test.

The harness `test/hooks.test.mjs` (node:test) is a case table `{ fixture, cmd, cwd, exit, rule }` seeded from every
"try it" line of the donor guards plus a second consumer app's cases. It spawns the hook with JSON on stdin and
`SHOPIFY_APP_KIT_MANIFEST` pointing at a fixture; branch-state cases use a throwaway git repo; heredoc and backtick
prose cases are properties. Hook headers shrink to a pointer at the test file.

## The operating model: GitHub as the work queue, routines as the workforce

- **One queue, one taxonomy, every repo.** The first consumer's issue contract generalises into the kit as the
  standard: the work-item issue template (the "Close condition needs" block), `labels.json` (the executor ladder
  `code only` → `agent:ci` → `agent:cloud` → `agent:local` → `human:decision|account|legal`, `p1`–`p3`,
  `roi:1`–`roi:5`, `blocked`, `launch-gate`, `deploy`) applied to every product repo by a kit script (an idempotent
  label sync), and milestones as the release-planning unit. The issue rules R1–R10 live in the `issue-filing`
  skill with a per-repo rule pointer; "agents never close a `human:*` issue" and "irreversibility beats the ladder"
  are kit rules. A pinned queue issue per repo, the maintainer's queue, is the only surface a human must read;
  everything else flows without the maintainer.
- **Scheduled Claude prompts (Claude Code routines) are the workforce.** The kit commits the prompt texts under
  `routines/` with `routines/REGISTRY.md` (routine, cadence, which repos, environment, what it may touch); the
  maintainer creates the routines, a fresh session per run, one cloud environment per repo. The first roster,
  each parameterised by `.claude/shopify-app.json`: `triage` (lint labels, process `human:decision` answers,
  unblock, check scheduled-workflow liveness, re-score, rewrite the pinned queue), `nuclear-review` (weekly review
  over the default branch, findings filed as issues with their ladder label), `graphify-refresh`, `kit-health`,
  `dependency-wave`, `pr-steward` (drive open `agent:*` PRs to green). The doctor warns when a registered routine's
  last run is stale, as a consumer's liveness test guards its scheduled workflows.
- **graphify, auto-updated.** A consumer ignored `graphify-out/` as a regenerable knowledge graph whose skill lived
  in no repo. The kit locates it, pins it as a companion, and adds the `graphify-refresh` routine that regenerates
  the graph per repo on a schedule and publishes it, so every session starts from a current map.
- **Security-prioritising by default, not by memory.** The `new-app` templates carry the first consumer's posture:
  gitleaks with a narrow config, a dependency audit, SHA-pinned actions with least-privilege `permissions:`,
  secrets never in issues (R10), a fail-loud `.env.example`. `pre-pr-review` always runs
  `qa-review-security-governance`; every plan runs `design-review-risk-governance`; the built-in `/security-review`
  rides the `pr-steward` routine. Organisation-level items for the maintainer: 2FA enforcement on the organisation,
  GitHub App scoping per repo, a paid plan if branch protection is wanted.
- **Multi-product portfolio.** Cross-repo routines (`kit-health`, `dependency-wave`, API-version end of life)
  iterate every product repo, and `new-app` adds one. (Since then the portfolio is discovered through
  `kit.portfolioId`, never listed.) An organisation `.github` repo carries the profile and organisation-wide issue
  templates once a third product exists.
- **The human gate stays exactly one wide.** The maintainer merges to production branches; everything upstream of
  that (filing, triage, building, reviewing, keeping PRs green) is agent work. Auto-merge to a pre-production
  branch for green `agent:*` PRs is a later decision, only after the review roster has a track record.

## Web check, 2026-09-20: what current practice said, and what changed

Sources: the Claude Code plugin and memory references, Shopify's `Shopify-AI-Toolkit` and
`shopify-app-template-react-router` repositories and the app package's changelog, the Shopify changelog entries on
expiring tokens and App Pricing, `automazeio/ccpm`, `githubnext/gh-aw`. Shopify's documentation hosts were blocked
from the planning sandbox, so every Shopify fact not already in a consumer's own docs was marked *(verify)* for the
`kit-health` routine to confirm with the Toolkit's doc fetch.

1. **Shopify ships an official Claude Code plugin, and the kit must not duplicate it.** `shopify-ai-toolkit`
   (`claude plugin install shopify-ai-toolkit@claude-plugins-official`, plugin name `shopify-plugin`, v1.8.4 then,
   MIT, auto-updating, no PRs accepted) carries 22 skills, among them `shopify-dev` (docs and schema search),
   `shopify-admin`, `shopify-custom-data`, `shopify-app-pricing`, `shopify-app-store-review` (a pre-submission
   checker that grades the codebase against Shopify's self-review requirements), `shopify-use-shopify-cli`,
   `shopify-polaris-app-home`, `shopify-liquid` and `shopify-functions`. It ships no agents and an empty `.mcp.json`;
   its two hooks are telemetry (`UserPromptSubmit`, and `PostToolUse` on Skill and Read, sending queries, code and up
   to 2000 characters of the prompt to Shopify). **Adjustments:** the kit drops its own Dev MCP config and declares
   the Toolkit a companion; `kit-bootstrap.sh` installs it and writes `~/.config/shopify-ai-toolkit/opt-out` (no
   prompt exfiltration from sessions that see `.env` names and store handles); `doctor` warns when it is missing;
   the `admin-api` skill keeps only what the Toolkit cannot know (the repo's pins, topic and handler parity, the
   tripwire, `$app:` accessors) and points at Toolkit skills for API knowledge; `release-readiness` runs the
   Toolkit's App Store review as one lens instead of a hand-written checklist. The kit owns exactly what the Toolkit
   does not: repo facts, guard hooks, the review roster, lessons, scaffolding, the operating layer.
   **The maintainer's ruling (2026-09-20): adopt it, on one condition: the Toolkit knows Shopify's own data;
   everything the apps layer on top stays the kit's to read and mutate.** The kit's `admin-api` keeps the recipes for
   app-owned Shopify data (AppInstallation metafields, app-owned metaobjects, `$app:` accessors, the entitlement write
   path and its cache contract) and defers only generic API knowledge; the app's own database and its operator MCP
   surface are `tenancy` and `mcp-connector`, never a Toolkit concern; the review lenses check the layered data
   (metafield parity, cache invalidation) because no Toolkit skill can. Telemetry opt-out is the default in
   `kit-bootstrap.sh` (flip it by deleting one line).
2. **The plugin design holds against the reference.** Project-level pins in `.claude/settings.json` do not
   auto-install (the user must trust and install), so `kit-bootstrap.sh` stays. Hooks from project-scope plugins
   still run in remote sessions, but MCP servers need per-server approval there, so the guards stay vendored.
   `--strict` validation is the CI check. Plugin agents may set `name, description, model, effort, maxTurns, tools,
   disallowedTools, skills, memory, background, omitClaudeMd, isolation`, never `hooks`, `mcpServers` or
   `permissionMode`; the agents-parity allowlist is exactly that list. `${CLAUDE_PLUGIN_ROOT}` changes on every
   update, one more reason guards are copied into the repo rather than referenced.
3. **Memory guidance: CLAUDE.md under 200 lines, path-scoped `.claude/rules/`, hooks for anything that must be
   enforced.** The first consumer's CLAUDE.md was within range; a second consumer app's 139 KB file is the
   anti-pattern the reference describes, which raises the value of a thin `.claude/` with rules carved out by path.
   `docs-owner` carries the 200-line rule; `doctor` warns when a consumer's CLAUDE.md exceeds it.
4. **Stack and auth, confirmed with two corrections.** The React Router template is Shopify's recommended path (the
   Remix template is on security fixes only); the app package was at 3.0.0 (Node 22+, `AppProvider` requires
   `apiKey` and always renders App Bridge, webhook `subTopic` removed, metaobject webhooks need filters, REST gone,
   Polaris web components only, Polaris React deprecated). The first consumer was on `^2.1.0`, so a major upgrade is
   a `dependency-wave` item and a review lens ("no `@shopify/polaris` React import in a new app; no REST client").
   **Expiring offline access tokens are mandatory for public apps created on or after 2026-04-01 and for all public
   apps from 2027-01-01** (a 60-minute access token, a 90-day refresh token, `expiring=1` on exchange, one live
   refreshable token per app per store: obtaining a new one invalidates the previous refresh token at once). The
   first consumer already set `future.expiringOfflineAccessTokens` and stored the refresh token and its expiry; a
   second consumer app sets it on day one. **Correction to the `tenancy` skill:** a background worker (a cron sync,
   a webhook replay) that refreshes independently of a web request can race it and strand the other side's refresh
   token, so the recipe needs one refresh chokepoint with a per-shop lock. The manifest gains
   `auth.expiringOfflineTokens` (tripwire: it equals the flag in `paths.shopifyServer`).
5. **Billing: Shopify App Pricing is the default for public apps; the Billing API is legacy but functional.** App
   Pricing is public-apps-only, hosts the plan page, and drops subscription webhooks after 2026-04-28 in favour of
   the Partner Active Subscription API; on 2026-07-09 public plans went to 8 and $0 test plans opened to reviewers
   and dev stores *(verify)*. The first consumer bills through App Pricing. **Adjustment:** the manifest carries
   `billing.method: "billing-api" | "app-pricing"`; an `app-pricing` app's billing code is a plan read plus a
   redirect parameter, not a port of a Billing API module; the kit's `release/references/billing-live-posture.md`
   points at the consumer's own billing doc as the owner of its facts rather than restating them.
6. **App Store review, what actually gets apps sent back:** webhook HMAC validation (checked first), over-requested
   scopes, non-Polaris UI, reliance on third-party cookies or local storage in the iframe, a Lighthouse drop over 10
   points, compliance webhooks. The Toolkit's self-review skill covers this list against the live requirements; the
   `review-correctness` lens keeps what a codebase check alone sees (scope creep against the toml, handler parity).
7. **Theme app extensions:** the app-block limit was raised to 30 *(changelog)*. A claim that legacy extension
   versions from before 2026-01 cannot deploy after 2026-10-01 surfaced in a secondary source; it likely concerns
   UI-extension API versions, not theme app extensions, and could not be confirmed *(verify before assuming an app
   is unaffected)*.
8. **Multi-tenancy:** the consensus is pooled tables with `tenant_id` plus RLS as defence in depth, application-level
   scoping on top; the two classic leaks are the service or bypass role used from request paths, and a policy on
   table A with an unguarded join to table B. A second consumer app's plan (two datasource roles, an isolation
   probe) matched; the `tenancy` skill adds "the app role must lack `BYPASSRLS`; a hosted provider's default
   superuser role has it" and "the isolation probe runs in CI as the app role".
9. **Board or issues.** Two data points: `ccpm` (issues as state, comments as the audit trail, explicitly avoiding
   the Projects API as complexity) and GitHub's own `gh-aw` (Projects only as a monitoring view over agent work).
   Agents writing to a Project need the `project` token scope, which the session's GitHub App token was not known to
   have, and the first consumer already had the queue: an epic with sub-issues, executor-ladder labels, a pinned
   queue issue. **Recommendation:** issues are the only queue and the only thing agents write; if a visual is
   wanted, the maintainer creates an organisation-level Project with auto-add workflows keyed on an epic label, and
   no session ever depends on it. The `issue-filing` skill documents that split. `gh-aw` is noted as the
   GitHub-native alternative to routines for repo-bound triage once branch protection exists; it needs an Actions
   secret for the model key, a new privileged actor the kit declined for now.

## Decisions, resolved and remaining

Resolved by the maintainer (2026-09-20): a separate repository for a second consumer app; the plugin under the
organisation; Postgres with RLS for that app; all 11 agents, ported from the latest upstream template (the ninth
review lens recommended); GitHub issues as the only queue, no Project board; Shopify's `shopify-ai-toolkit` as the
kit's companion plugin, with app-layered data staying in the kit's own skills (the ruling under the web check, item 1).

Remaining, with the default the plan assumed:

1. Plugin repository visibility under the organisation: **public** (the organisation already had public repos; a
   tripwire keeps the kit literal-free) versus private.
2. Does the organisation have a paid GitHub plan? **Assume Free** until confirmed: hooks stay the only branch gate.
   If paid, add branch protection to the product repos and the plugin repo; the hook stays as a backstop.
3. Branch model for a second consumer app: **the first consumer's pre-production → `main` promotion** (the
   pre-production branch deploys its own app registration; only the maintainer merges to `main`) versus a single
   `main`. The manifest field carries either.
4. The ninth persona (`qa-review-divergence-hunter`): **include**.
5. Distribution for a second consumer app: **App Store, multi-tenant** from day one (custom distribution cannot be
   converted later: `admin-api`'s `distribution-is-one-way.md`).
