# Changelog

All notable changes to shopify-app-kit. The version is the plugin version in `.claude-plugin/plugin.json`; every
vendored hook carries it on line 2 (`# shopify-app-kit vX.Y.Z`).

## 0.9.0

The operating layer: the label set and its sync script, the issue-filing rules, the committed prompt texts of the
scheduled Routines, the portfolio, scheduled-workflow liveness in the doctor, and the graphify companion.

- `labels.json` at the kit root: `labels` (eight work types: `code only` `ededed`; the agent rungs `agent:ci`
  `bfd4f2`, `agent:cloud` `6fa8dc`, `agent:local` `1d5fa3`; the human rungs `human:bootstrap` `fbca04`,
  `human:decision` `e99695`, `human:account` `d93f0b`, `human:legal` `b60205`; priorities `p1`..`p3`; ROI buckets
  `roi:5`..`roi:1`; gating `launch-gate`, `blocked`, `deploy`; origin `qa`, `dependencies`, `bug`,
  `documentation`) and `ladder`, the executor order (`code only` → `agent:ci` → `agent:cloud` → `agent:local` →
  `human:decision` → `human:account` → `human:legal`, `human:bootstrap` alongside `human:account`).
  `scripts/sync-labels.mjs` (zero dependencies) runs `gh label create <name> --color --description --force` per
  label (idempotent; `--dry-run` prints the commands, `--repo <owner>/<repo>` optional, `--file` for a consumer's
  own copy; never deletes). `test/labels.test.mjs`: valid JSON, unique names, six-hex colors, exactly eight work
  types with the documented colors, the ladder, descriptions within GitHub's 100 characters, the dry-run listing
  every label once, a failed gh call reported without deleting anything.
- `skills/issue-filing` (model-invocable): read `labels.json` (the consumer's `.github/labels.json` when present),
  the manifest, the work-item template; the ten rules in `references/rules.md` (R1 ladder, R2 close condition
  needs, R3 decompose at filing, R4 bootstrap issues that name where a value goes and what they unlock, R5
  decisions need options, R6 irreversibility beats the ladder, R7 agents never close a `human:*` issue and
  relabel downward only on a `decision:` comment or a closed bootstrap, R8 same pass same PR, R9 CI-filed issues
  deduped on the title prefix with `bug` + `p1` + the executor label and no traces, R10 secrets never appear in an
  issue) plus the pinned maintainer's-queue exemption; `references/executor-ladder.md` (each rung's can and
  cannot, the readiness table, a higher rung may always substitute). Lessons `ops-1` to `ops-9`.
- `routines/`: one markdown file per routine with the header (cadence, environment, what it may touch, what it
  must never do) and the prompt verbatim under `## Prompt`, written for a fresh cloud session with the GitHub
  MCP tools unless stated; every prompt reads `.claude/shopify-app.json` and `labels.json` first, derives the
  repository from the git remote, never closes a `human:*` issue, never relabels human → agent except per R7,
  never dispatches a workflow in `deploy.protectedWorkflows`, and opens at most one PR per run to
  `branches.default`. `triage.md` (weekly, six steps in order: lint, decisions, closed bootstraps, stale
  scheduled workflows with dispatch and the 403 note, re-score with one ranking-doc PR, the queue issue rewritten;
  every 13th run orphan labels and 90-day-old `human:*` issues), `nuclear-review.md` (weekly: `review` over the
  week's merged diff or the whole default branch monthly, blockers and majors filed as issues after an R9 search,
  pre-existing findings in one queue comment, never a PR), `pr-steward.md` (daily: agent-owned PRs to green,
  the babysit posture, never merge, never push to a protected branch), `kit-health.md` (monthly: the doctor,
  `kit.version` against the kit's latest tag, the pinned API version's support window through the companion's
  docs search with an issue inside 3 months of end of support, library-major divergence across `portfolio.json`),
  `graphify-refresh.md` (weekly: `graphify-out/` committed on the `graph/` branch with force-with-lease on that
  branch only, skipped when nothing merged), `dependency-wave.md` (weekly: High/Critical advisories and the
  deferred majors from `dependabot.yml`'s ignore block in one `dependencies` + `agent:ci` issue).
  `routines/REGISTRY.md`: the table (routine, cron, environment, tools, may touch) and the maintainer's step, a
  `create_trigger` call with `create_new_session_on_fire: true`, the cron and the prompt pasted.
  `test/routines.test.mjs`: the header fields, the `## Prompt` section, the registry row with a five-field cron
  matching the header, distinct off-the-hour minutes, no repository literal, the boundary phrases, the steps.
- `portfolio.json`: `products[]` with `name`, `repo` (`<owner>/<repo>`), `manifest`, `environment`, `routines`;
  one placeholder entry. The README's "The operating layer" section explains that cross-repo routines iterate it
  and `new-app` appends to it; `skills/new-app` gains that as a documented manual step (checklist item 9: labels
  synced, the queue issue pinned, the app appended, the triggers created), not code.
- `hooks/doctor.sh`: when the consumer's `.github/workflows` has scheduled workflows and `gh` is on PATH, one
  `Schedule:` line per workflow with the age of its last successful run (`gh run list --workflow <file> --status
  success`), a warning past twice the cadence read from the cron line (daily, weekly, monthly), "no successful
  run on record" for a workflow that never succeeded, one line when gh cannot list runs; silent without `gh`.
  `skills/doctor` step 7. Tests with a fake `gh` that answers `run list` from a JSON map, like the hooks test's
  fake `gh pr view`.
- graphify companion (`Graphify-Labs/graphify`, MIT). Its README installs a PyPI package, not a plugin:
  `pip install graphifyy && graphify install` (recommended `uv tool install graphifyy` or `pipx install
  graphifyy`), after which `graphify install` writes the skill to `~/.claude/skills/graphify/SKILL.md` (or
  `$CLAUDE_CONFIG_DIR/skills/graphify/`). The latest release is `v0.9.65` (2026-09-20, the PyPI version; the
  repository also carries a stale `v1.0.0` tag from April whose `pyproject.toml` says 0.1.10, so the pin follows
  PyPI). `templates/.claude/hooks/kit-bootstrap.sh` installs it the same guarded way as the Shopify companion,
  pinned (`graphifyy==0.9.65`, `uv` then `pipx` then `pip`, then `graphify install`; skipped when the CLI or the
  skill file exists; best-effort, exit 0). `hooks/doctor.sh` warns once when neither the `graphify` CLI nor the
  skill file (config dir or repo) exists, naming the pinned install; `GRAPHIFY_VERSION` in the doctor and the
  bootstrap hook must agree (`test/templates.test.mjs`). `templates/.claudeignore` lists `graphify-out/` (with the
  note to add the same line to `.gitignore`: the template's own `.gitignore` is upstream's and is not overlaid),
  so the graph is committed on the `graph/` branch only and never invalidates the prompt cache. README "Companion
  plugins" gains the second entry with what graphify covers and what the kit covers (the refresh routine, the
  branch convention); `skills/doctor/references/companion.md` gains "The graph companion" (lesson `kit-2`).
- README: rows for `issue-filing`, `labels.json` + `sync-labels`, `routines/`, `portfolio.json`; the doctor rows;
  "The operating layer" section. `kit-dev`: the layout rows and "Add a routine". `test/hooks.test.mjs` fakes
  `gh run list`; `test/templates.test.mjs` checks the bootstrap pin and `.claudeignore`.
- Hook headers, `KIT_VERSION`, `plugin.json` and the annotated fixture's `$schema` bumped to 0.9.0; guard logic
  unchanged; the doctor gains the graphify line and the `Schedule:` lines.

## 0.8.0

The `new-app` scaffold skill, and the companion plugin wired into the doctor and the skills.

- `skills/new-app` (user-invoked: `<app-name> [--server-dir <dir>] [--pm npm|pnpm] [--default-branch <b>]
  [--protected-branch <b>] [--dry-run <dir>]`): preconditions checked before anything is written (Shopify CLI on
  PATH, empty target, `--pm` in `npm|pnpm`, valid branch names; the protected branch defaults to the default
  branch and a different one makes the promotion pair); `shopify app init` from the official React Router
  template with the flags the installed CLI lists, or a clone of the template when init would need the
  maintainer's account (in a non-interactive shell the current CLI requires `--organization-id` or
  `--client-id` plus a login; the skill never supplies them); the overlay from `templates/` applied by
  `scripts/apply-overlay.mjs` (the five placeholders substituted, the gitleaks pair left as a TODO, a template
  file never overwritten: text gets a delimited kit section that a re-run replaces, JSON is deep-merged with the
  template winning, anything else is set aside as `<file>.shopify-app-kit`; the guards vendored and
  `kit.version` and the tag `$schema` stamped as `sync` does; the `example` configs and tomls renamed to the
  app's slug and prefixed with the server directory; `branches.promotion` derived); the post-scaffold edits
  (`future.expiringOfflineAccessTokens: true` and the `refreshToken` / `refreshTokenExpires` session columns
  checked and added when missing, the Prisma datasource pointed at Postgres through `DATABASE_URL` and
  `DIRECT_DATABASE_URL` with the template's SQLite migration removed, `docs/README.md` with the docs map and
  only the rows whose file exists, `docs/history/`, `docs/adr/0001-scaffold.md` recording the template
  reference, the kit version, the branch model and the open seeds, with its index row); verification with the
  consumer's `test/docs-consistency.test.mjs`, `scripts/validate-manifest.mjs` (the kit's validator copied,
  plus a check for surviving placeholders) and `scripts/smoke-guards.sh` (every vendored guard fed a
  PreToolUse payload on stdin: exit 0 on a benign command, 2 on `shopify app deploy` without `--config`, a push
  to the protected branch, the wrong package manager); `git init -b <default-branch>` and one commit; the
  maintainer's checklist (remote, registration and `config link`, hosting app, database project with the two
  roles and the first Postgres migration, secrets, gitleaks pin, branch protection, first doctor). `--dry-run`
  does everything but the commit into a scratch directory and prints the tree. References: `scaffold.md` (what
  the template gives, the init flags and the clone fallback, the merge rules, the manifest after the overlay,
  the post-scaffold edits, verification, the checklist, why the skill never touches an account) and
  `carry-over.md` (only `app/` modules and re-based migrations that pass the new repo's tests; never a donor's
  `.engine/`, `.claude/` or CI; the ADR log re-keyed keeping numbers; probes before the first push).
- `test/new-app.test.mjs`: the frontmatter and allowed tools, every placeholder the skill mentions is in
  `templates/README.md`, the scripts are linked, `validate-manifest.mjs` accepts the substituted starter
  manifest and rejects a bad `billing.method` and a surviving placeholder, and `apply-overlay.mjs` run against a
  stand-in template (package.json, a Shopify server module without the flag, a SQLite Prisma schema whose
  Session lacks the refresh columns, `CLAUDE.md`, `.gitignore`) yields a repo where the manifest validates, the
  hooks are vendored and fire (`smoke-guards.sh`), the docs-consistency test passes, the edits landed, no
  placeholder survives but the gitleaks pair, a second run changes nothing, and the `--server-dir web` variant
  prefixes the paths. `test/skills-parity.test.mjs` allows `scripts/` (only `.mjs` and `.sh`, linked from the
  SKILL.md, header naming itself, syntax-checked, node: builtins only).
- Companion plugin (`shopify-ai-toolkit`): `hooks/doctor.sh` prints one warning naming the install command when
  `claude plugin list` runs and does not list it, and one info line with the opt-out command while
  `~/.config/shopify-ai-toolkit/opt-out` is absent; silent without the `claude` binary, never blocks. Doctor
  tests fake `claude` on PATH the way the hooks test fakes `gh`, with a throwaway HOME. `skills/doctor` gains
  step 6 and `references/companion.md` (the split: the companion answers what the platform does, the kit what
  the manifest requires; lesson `kit-1`). `admin-api` step 4 now uses the companion's `shopify-dev` skill for
  schema verification and says "unverified" without it, and its opening states the split; `dev-loop` points at
  `shopify-use-shopify-cli` for the CLI reference; `release` gains the App Store review check before the
  promotion PR of a public app, with a checklist line. README: a "Companion plugin" section, the doctor row,
  the `new-app` row, the Scaffolding section rewritten around the skill.
- `templates/`: the starter manifest's `docs.mapFile` is `docs/README.md` (the template's own `README.md` is
  upstream's), and `CLAUDE.md` points there; `docs/README-docs-map.md` says the skill writes it.
- `lessons/INDEX.md`: `new-1` to `new-4` and `kit-1`. `kit-dev` documents `skills/<name>/scripts/`.
- Hook headers, `KIT_VERSION`, `plugin.json` and the annotated fixture's `$schema` bumped to 0.8.0; guard logic
  unchanged; the doctor gains the two companion lines.

## 0.7.0

Repo-shell templates, and two skills for multi-tenant apps: `tenancy` and `mcp-connector`.

- Schema v1, additive: `auth.expiringOfflineTokens` (boolean; the app runs `future.expiringOfflineAccessTokens`
  and its session table carries `refreshToken` and `refreshTokenExpires`; required by Shopify for public apps
  created on or after 2026-04-01 and for all public apps from 2027-01-01), `billing.method`
  (`billing-api | app-pricing | none`; App Pricing is the public-app default with no subscription webhooks, the
  Billing API is legacy but the only path for custom distribution), and `docs.adrDir`, `docs.mapFile`,
  `docs.mapHeading`. All carry descriptions. `hooks/doctor.sh` accepts the two new top-level sections and prints
  "Expiring offline tokens" and "Billing method" when present; no guard behaviour changes. New fixture
  `test/fixtures/manifests/multi-tenant-app.json`; schema tests for the valid keys, every enum value, a rejected
  enum value and wrong types; doctor tests for the printed facts. The README's manifest contract gains a table
  for the keys the doctor prints and the skills read.
- `templates/`: the repo shell a new app starts from, generic and written from the kit's lessons. CI workflow
  (`contents: read`, per-ref concurrency, `pull_request` plus `workflow_call`, a `verify` job with frozen install,
  `--audit-level=high`, `prisma generate`, typecheck, test, build, and a `migrations` job that runs
  `prisma migrate deploy` from an empty Postgres service container then `prisma migrate diff --from-url
  --to-schema-datamodel --exit-code`), `secret-scan.yml` (gitleaks over the full history on every PR and weekly,
  a version-pinned release tarball with its SHA-256 verified before running, `--redact`, off-the-hour cron, the
  60-day note; version and checksum left as placeholders), `.gitleaks.toml` (defaults plus a credentialed
  connection-URI rule, narrow allowlists each with a reason), `dependency-audit.yml` (weekly, opens or comments an
  issue through the composite `failure-issue` action, run stays green), `dependabot.yml` (actions, npm root and
  server, docker; minor/patch grouped; framework majors ignored as deliberate migrations), the work-item issue
  template with the "Close condition needs" ladder and the irreversibility check, `.env.example` with
  public/secret/local markers, `DIRECT_DATABASE_URL` and the dev-command database fingerprint, the docs-map
  section shape and `test/docs-consistency.test.mjs` (unmapped file, missing path, dated heading in a reference
  doc, ADR without an index row; allowlists that only shrink; repair string in every message), the MADR-lite ADR
  index and template, `docs/adr/SEEDS.md` (thirteen decisions a new app takes before Phase 1), and the `.claude/`
  wiring: `settings.json` (marketplace pin, enabled plugins, the three vendored guards, the bootstrap hook),
  `hooks/kit-bootstrap.sh` (remote sessions only; installs the kit and the official companion plugin when absent,
  writes the telemetry opt-out, never fails the session), the starter `shopify-app.json` (expiring offline tokens,
  App Pricing, RLS Postgres), four path-scoped rule seeds (`billing`, `prisma`, `docs`, `pr-and-issues`, each
  ≤ 25 lines) and a CLAUDE.md under 60 lines. Actions pinned by SHA. `templates/README.md` documents the
  placeholders (`{{APP_NAME}}`, `{{DEFAULT_BRANCH}}`, `{{PROTECTED_BRANCH}}`, `{{PACKAGE_MANAGER}}`,
  `{{SERVER_DIR}}`, `{{GITLEAKS_VERSION}}`, `{{GITLEAKS_SHA256}}`) and every file.
- `test/templates.test.mjs`: every template listed in the README, every placeholder documented and used, the
  starter manifest validates after substitution, JSON parses, YAML passes a dependency-free structural check
  (including a quoted-placeholder rule, since an unquoted `{{X}}` at the start of a YAML value is a flow
  mapping), scripts pass `bash -n` / `node --check`, header comments, least-privilege and SHA-pin and cron-minute
  rules over the workflows, the gitleaks allowlist reasons, the executor rungs, the env markers, rule-seed and
  CLAUDE.md line limits. The schema validator moved to `test/lib/schema-validate.mjs` so both tests share it.
- `skills/tenancy` (model-invocable): reads `database.provider`, `database.rls`, `auth.expiringOfflineTokens`,
  `paths.prisma`; seven steps for a new table, query path, cron, webhook handler or token change. References:
  `rls-fail-closed.md` (tenant-bound tables, two roles from the first migration with no `BYPASSRLS` on the runtime
  role, migrations own roles and policies, `withTenant` with `SET LOCAL`, tenant-leading indexes),
  `isolation-probe.md` (the isolation canary, the model registry, probes as the runtime role, verb probes on the
  grant floor), `request-bootstrap.md` (identity from a verified credential, lazy provisioning and the
  `afterAuth` trap, crons iterate tenants), `principal-identity.md` (the `Principal` table, actor stamping,
  append-only audit), `expiring-tokens.md` (the requirement and dates, the flag and columns, one per-shop-locked
  refresh chokepoint, purge on refresh expiry), `webhook-intake.md` (verify, record, process, mark; 401 before
  recording; idempotent on the delivery id; compliance payloads never persisted; the signature covers the body
  only).
- `skills/mcp-connector` (model-invocable): for an app's own operator-facing MCP server. References:
  `per-grant-tokens.md` (scanner-matchable format, sha256 at rest, per-grant rows, Bearer only, last-used and IP
  allowlist, `AsyncLocalStorage` context with `assertRole`, tenant-prefixed tokens under RLS),
  `oauth-dcr-pkce.md` (RFC 7591 registration persisted, PKCE S256 and tenant-prefixed codes, the consent route
  group outside the dashboard layout, RFC 8414/9728 discovery, `no-store` token endpoint with 30-day tokens and
  no refresh grant), `redirect-uri.md` (parse as URL, loopback bypasses the allowlist per RFC 8252 §7.3, https
  and allowlisted otherwise, validated at four steps and never reflected unmatched), `manifest-parity.md`,
  `rate-limits-and-cost.md`, `skills-distribution.md`.
- `lessons/INDEX.md`: 24 `ten-*` and 23 `mcp-*` rows, one per new reference section; the row-count ceiling in
  `test/lessons-index.test.mjs` raised to 200.
- README: rows for `tenancy`, `mcp-connector` and `templates/`, a "Scaffolding" section, the manifest example
  and the new keys; `docs-owner` gains the rule that CLAUDE.md stays under 200 lines with mechanics in
  path-scoped `.claude/rules/`; `kit-dev` lists `templates/`.
- Hook headers, `KIT_VERSION`, `plugin.json` and the annotated fixture's `$schema` bumped to 0.7.0; hook logic
  unchanged apart from the doctor's two new printed facts.

## 0.6.0

The `pre-pr-review` workflow: the diff-stage roster in one go, deduped, verified, one verdict.

- `workflows/pre-pr-review.js` (the kit's first workflow; Claude Code loads `workflows/*.js` from the plugin root as
  `/shopify-app-kit:<meta.name>`): a scoping agent reads the manifest, picks the base like the review skill
  (argument, PR base, `promotion.to` from the promotion branch, `branches.default`, `main`), lists the changed files
  and takes the intent from the PR body or a plan file; the five `qa-review-*` agents run in parallel, with
  `prisma-migration-reviewer` when the diff touches `paths.prisma`, a `schema.prisma` or a migrations directory and
  `storefront-extension-reviewer` when `paths.extensions` is declared and touched (`all: true` forces both); every
  reviewer is launched as `agentType: shopify-app-kit:<name>` with a structured findings schema (severity,
  claim, file, line, section, evidence, fix, plus headline and what was checked); findings on the same file within
  three lines, or the same section without a file, merge into one carrying the highest severity and every reviewer;
  each blocker and major (up to twelve, the rest reported unverified) goes to a read-only skeptic, and a refuted
  finding is kept as a `note` with the reason; the verdict is `block` / `changes-needed` / `approve`. Skipped and
  failed reviewers are returned by name. Arguments: a base-branch string or `{ base, pr, reviewers, all }`.
- Tests: `test/workflows-parity.test.mjs` (only `.js` files, `export const meta` first and a pure literal evaluated
  with no globals, `name` = file name, `whenToUse` with "Use when", phase titles equal to the `phase()` calls and
  `phase:` options, every `shopify-app-kit:<agent>` exists under `agents/`, the script parses as a workflow body
  (an async function, so top-level `await` and `return` are allowed as the runtime allows them), no `Date.now` /
  `Math.random` / `new Date()` / `require` / `import` / `process`); `test/workflows-run.test.mjs` runs the script
  under a stub runtime with canned reviewer output and asserts roster selection, dedupe, refutation, the failed
  list, the empty-diff short-circuit and the verdict.
- README: a row for the workflow and a "The pre-pr-review workflow" subsection replacing the "arrives in the next
  version" note; `kit-dev` documents `workflows/` and how to add one; the review skill points at the workflow.
- CI's version-bump check already watched `workflows/`.
- Hook headers, `KIT_VERSION`, `plugin.json` and the annotated fixture's `$schema` bumped to 0.6.0; hook logic
  unchanged.

## 0.5.0

A review roster: nine single-lens review personas ported from the Engine template, plus two Shopify stack reviewers.

- Ported from `StarshipSuperjam/engine-template@0c0a693eebe511736e886ee2aeb804c941bfbb03` (`.claude/agents/engine-*.md`,
  the `engine-` prefix dropped; the plugin namespaces them as `shopify-app-kit:<name>`):
  - plan stage, run on a plan before building: `design-review-architecture`, `design-review-feasibility`,
    `design-review-product-intent`, `design-review-risk-governance`;
  - diff stage, run on a branch before a PR: `qa-review-security-governance`, `qa-review-spec-conformance`,
    `qa-review-technical-integrity`, `qa-review-usability`, `qa-review-divergence-hunter` (assumes a divergence
    exists and hunts for it: built to pass its tests while doing the wrong thing, half-done requirements, code nobody
    asked for).
  - Not ported: `engine-audit`, `engine-grounding-scout`, `engine-validation-runner`, `engine-worker-builder`,
    `engine-worker-bounded` (they depend on the Engine's orchestrator, memory MCP servers or Build-DAG packets).
- Port rules:
  - Each body keeps its four headings (Mandate / How you work / What you produce / Boundaries), the reviewer's voice,
    and the standing clause (a review that finds nothing because it did not look hard is a failure; be exact, not
    contrary; you report, the operator decides).
  - Frontmatter is restricted to the Claude Code agent fields `name, description, model, effort, maxTurns, tools,
    disallowedTools, skills, memory, background, omitClaudeMd, isolation`. The Engine's `role`, `lens`, `model-tier`,
    `permissions`, `reviewer-contract`, `reviewer-contract-version` and `output-contract` are dropped. Every reviewer
    sets `tools: Read, Grep, Glob, Bash`, `disallowedTools: Edit, Write, NotebookEdit` and `effort: high`;
    `model: opus` where upstream said so (architecture, feasibility, product-intent, risk-governance,
    security-governance, divergence-hunter). `name` equals the file name; `description` is one paragraph ending in
    a "Use when" clause.
  - Every reference to Engine machinery (review packet, digest, Build plan, `.engine/` state, grounding scout,
    orchestrator adjudication, the Engine fixture clone, the JSON result contract) is rewritten into ours: the plan
    file or the PR description, `git diff origin/<branches.default>...HEAD` with `branches.default` read from
    `.claude/shopify-app.json`, the changed files, the manifest itself, and `docs/adr/` when present. A persona
    works when launched with only "review this branch" and a checkout; the reading is its own (no subagents).
  - Every "What you produce" names one findings shape a later workflow can dedupe: severity
    `blocker | major | minor | note`, a one-line claim, the evidence (`file:line` or plan section), a proposed fix.
- Two new Shopify stack reviewers, written fresh under the same rules:
  - `prisma-migration-reviewer`: reads `paths.prisma`, `database.provider`, `database.rls`,
    `database.sharedDevDbWithBeta` and `deploy.scaleToZeroBeforeMigrate` first; checks destructive operations and
    whether the PR body acknowledges them, schema/migration parity, migration SQL hand-edited after generation, RLS
    on every new table (`tenant`/shop column, `ENABLE` and `FORCE ROW LEVEL SECURITY`, policies for the app role)
    when `rls` is true, the stated scale-to-zero step, the shared-beta drift warning, and `refreshToken` /
    `refreshTokenExpires` in session storage for expiring offline tokens. Never proposes editing a generated
    migration in place.
  - `storefront-extension-reviewer`: a one-line no-op when `paths.extensions` is empty or absent; otherwise Liquid
    settings-schema backward compatibility, platform-minted app-block uids, CDN edge-cache assumptions on metafield
    reads, asset size limits and silent deploy validation, vendored-copy parity (one `sync` writer plus a drift test
    under `checks.tripwireDir`), no server round-trip for storefront-critical data, locale files in step with the
    block schema.
  - Shopify Admin API coverage stays in `review-correctness`; no third agent.
- `test/agents-parity.test.mjs`: `ALLOWED_KEYS` is exactly the 12-field list above (`permissionMode`,
  `mcpServers`, `hooks` and `color` removed); every agent is read-only either by a `tools` list without
  Write/Edit/MultiEdit/NotebookEdit or by a `disallowedTools` naming Write, Edit and NotebookEdit; the eleven roster
  files must set `disallowedTools`, carry the four headings, the standing clause and "you report; the operator
  decides", and contain no Engine frontmatter key nor the strings `.engine/` or `review packet`; the roster list
  itself is asserted.
- README: one row per new agent and a "Review roster" subsection (a `pre-pr-review` workflow arrives in the next
  version); `skills/review/SKILL.md` points at the roster (no behaviour change).
- Hook headers, `KIT_VERSION`, `plugin.json` and the annotated fixture's `$schema` bumped to 0.5.0; hook logic
  unchanged.

## 0.4.0

Five developer skills with reference files, a lessons index, and release-on-merge tagging.

- Skills (each a short `SKILL.md` that reads the manifest first, with depth in `references/*.md`):
  - `dev-loop` (model-invocable): `app dev` with the manifest's dev config and the bindings-file store, the
    sandbox port flag, `app dev clean` at the end of every session, theme work from a scratch directory.
    `references/cli-traps.md` covers the implicit default config, `automatically_update_urls_on_dev`, the
    expiring quick tunnel, the missing `clean`, and the dev/production handle-prefix rule.
  - `admin-api` (model-invocable): pin discipline and topic/handler parity before any GraphQL, webhook or toml
    change; the Shopify Dev MCP when configured; throw on `userErrors`. References: `api-version-drift.md`,
    `webhooks.md`, `graphql-errors.md`, `metaobjects-and-app-accessors.md`, `distribution-is-one-way.md`.
  - `release` (user-invoked, `[beta|extension|server]`): promotion PR never merged, extension deploy with the
    deploy config and slug verification, server release by push to the workflow's branch, scale to zero before
    migrating, live-billing warning, a paste-able checklist. References: `billing-live-posture.md`,
    `migrations-and-zero-downtime.md`, `ci-posture.md`.
  - `tripwire` (model-invocable): one offline test per fact family, repair string in the message, allowlists that
    only shrink, docs point at the check. References: `tripwire-patterns.md`, `checks-vs-probes.md`.
  - `docs-owner` (model-invocable): one owning document per fact, no dates or incidents in reference docs,
    warnings replaced by checks, path-scoped rules over the always-loaded file, MADR-lite ADRs. References:
    `single-owner.md`, `adr-shape.md`.
- `lessons/INDEX.md`: one row per lesson (`id | rule | class | home | source`) pointing at the reference file
  or review-agent section that owns it; `lessons/README.md`: the extraction discipline, the classes (`rule`,
  `recipe`, `lens`, `adr-seed`) and the three neutral sources (`app-1`, `app-2`, `app-3`).
- `.github/workflows/release-tag.yml`: on push to `main`, tags `v<plugin.json version>` when the tag does not
  exist and publishes a GitHub Release with that version's CHANGELOG section (idempotent; SHA-pinned actions;
  `contents: write`; a `concurrency` group). Tags are no longer pushed by hand. v0.3.0's tag was the last manual
  one and may be created by the maintainer for history; consumers should pin `$schema` to the newest tag.
- Tests: `test/skills-parity.test.mjs` allows a `references/` directory per skill and checks that every reference
  is linked from its `SKILL.md`, has no frontmatter, ends with a `Sources:` line naming only the neutral labels,
  and that such a `SKILL.md` stays at or under 60 lines. New `test/lessons-index.test.mjs`: every home exists,
  every anchor matches a heading, closed class and source sets, unique ids, every reference file indexed.
- CI's version-bump check now also watches `lessons/`.
- README (skills table, Lessons section, tagging note), `kit-dev` (adding a lesson, the release flow), `doctor`
  and `sync` (no version-dated prose); hook headers and `KIT_VERSION` bumped to 0.4.0; hook logic unchanged.

## 0.3.0

Two more manifest-driven guards, a license, and a hardened CI workflow.

- `hooks/guard-protected-branch.sh`: PreToolUse guard for `git` and `gh`, driven by `branches.protected`,
  `branches.default`, `branches.promotion` and `deploy.protectedWorkflows`. Blocks `git push` whose destination is a
  protected branch (explicit refspecs including `:main`, `x:refs/heads/main` and a leading `+`; `--all` / `--mirror`;
  an implicit, `HEAD` or `@` push from a checkout on a protected branch, honouring `git -C`), `gh pr merge` of a PR
  whose base is protected (resolved with `gh pr view`; an unresolvable base is blocked too), `gh pr edit --base` onto
  a protected branch, `gh api` writes to `pulls/<n>/merge`, `/merges` with a protected `base=`, `git/refs/heads/<protected>`
  and any `mergePullRequest` mutation, and `gh workflow run` of a protected workflow by file name, path or the
  `name:` read from the consumer's `.github/workflows/<file>`. `gh pr create --base <protected>` (a promotion PR),
  pushes to the default or a feature branch, `gh api` reads and other workflows pass. Fails closed without jq,
  without a manifest, with an empty `branches.protected`, or after a `cd` to a non-literal path before an implicit push.
- `hooks/guard-package-manager.sh`: PreToolUse guard driven by `packageManagers`. Blocks `pnpm …` in a directory the
  manifest maps to `npm`, and `npm install|ci|i|add|update|uninstall|run …` in a directory mapped to `pnpm`; the
  effective directory follows `cd`/`pushd`/`popd`/subshells (via `lib.sh`) and `pnpm -C` / `--dir` / `npm --prefix`.
  The lookup is by exact manifest entry (`"."` for the root); directories the manifest does not name are left alone.
  Nearest-ancestor lookup (judging `web/app` by the `web` entry) is deliberately deferred to a later version.
  `npx`/`pnpx`/`bunx`/`corepack` prefixes are skipped and `npx` itself is never blocked. Fails closed without jq,
  without a manifest (for guarded commands only), or after a `cd` to a non-literal path.
- `LICENSE`: MIT, with a third-party notice for `agents/review-correctness.md` and `agents/review-quality.md`, which
  are adapted from Cursor's Thermos plugin (MIT). `.claude-plugin/plugin.json` now declares `license: MIT`.
- CI: `actions/checkout` and `actions/setup-node` are pinned by commit SHA (tag in a trailing comment), a
  `concurrency` group cancels superseded runs, and `.github/dependabot.yml` bumps the pins weekly.
- Tests: case tables for both guards over the fixtures (a fake `gh` answers `pr view`, throwaway checkouts cover
  implicit pushes, consumer workflow files cover display names); new fixture
  `test/fixtures/manifests/release-train-app.json` (two protected branches, a different default).
- README, `sync` and `doctor` skills list the three guards; hook headers and `KIT_VERSION` bumped to 0.3.0.

## 0.2.1

Follow-ups from the first consumer adoption.

- Manifest metadata keys: schema v1 now allows `$schema` and `$comment` (both optional strings) at the top level, so a
  consumer can point editors at the schema and leave a note without `hooks/doctor.sh` reporting them as
  "unknown top-level key". The doctor's known-key list matches; every other unknown key is still reported and still
  fails schema validation. New fixture `test/fixtures/manifests/annotated-app.json` covers both.
- README: the repository is public, so the marketplace pin resolves without a token; documented that a project pin
  registers the marketplace but does not install the plugin until `claude plugin install` has run once, and how a
  consumer running in cloud sessions bootstraps that with a repo-owned SessionStart hook.
- Hook headers and `KIT_VERSION` bumped to 0.2.1; hook logic unchanged.

## 0.2.0

Review agents, modelled on Cursor's Thermos plugin (MIT) and made manifest-aware.

- `agents/review-correctness.md`: diff-scoped bugs, breakage, security and devex audit, plus a checklist keyed to
  the manifest: auth boundaries, `apiVersion.pins`, `webhooks.topics` and compliance handlers, `scopes`, app TOML
  parity, `branches` and `deploy.protectedWorkflows`, `scaleToZeroBeforeMigrate`, `billing.testFlag`, shop-scoped
  queries under `database.rls: false`, destructive migrations under `sharedDevDbWithBeta`, lockfiles per
  `packageManagers`, extension API versions, `checks` tests and kit-owned files. Reports P0/P1/P2 with file:line
  evidence, a manifest-checks table, and what it chose not to report.
- `agents/review-quality.md`: strict maintainability review with a canonical-layer table for Shopify apps built on
  React Router and Prisma, the file-size limit taken from `checks.fileSize`, code-judo simplifications, spaghetti
  growth, boundary and type-contract problems, and presumptive blockers.
- `skills/review/SKILL.md` (user-invoked): picks the base from the manifest, gathers the diff, launches both
  agents in parallel with identical context, dedupes and synthesizes one verdict. Never posts to a PR unless asked.
- `test/agents-parity.test.mjs`: agent frontmatter keys, name = file name, description with "Use when", read-only
  tools.
- Hook headers and `KIT_VERSION` bumped to 0.2.0; hook logic unchanged.

## 0.1.0

First release: skeleton, schema, one guard, doctor, tests, CI.

- Plugin skeleton: `.claude-plugin/plugin.json`, its own marketplace (`.claude-plugin/marketplace.json`,
  source `./`), `hooks/hooks.json` registering only the SessionStart doctor.
- Manifest schema v1 (`schemas/shopify-app.v1.schema.json`, draft 2020-12): closed top level, additive sections,
  policy enums for `shopifyCli`, `configs.*` required when the matching policy is `config-required`.
- `hooks/lib.sh`: manifest resolution (`$SHOPIFY_APP_KIT_MANIFEST`, `$CLAUDE_PROJECT_DIR`, walk up from cwd),
  consumer-root derivation, `block()`, path helpers, heredoc stripping, control-operator splitting and `cd`
  tracking, exposed as `kit_walk_commands`.
- `hooks/guard-shopify-cli.sh`: `app dev` per `devPolicy`, `app deploy` per `deployPolicy`, `app config use` per
  `configUsePolicy`, `<pm> run deploy` blocked unless deploy is `allowed`, `theme dev` from the repo root per
  `themeDevFromRoot`. `config-required` also checks that the `--config` value equals the manifest's config.
  Fails closed without jq, without a manifest, or after a `cd` to a non-literal path.
- `hooks/doctor.sh`: SessionStart briefing with a jq structural validation, app facts, vendored-hook and settings
  drift; never exits non-zero; silent without a manifest.
- Skills: `doctor`, `sync` (user-invoked), `kit-dev` (user-invoked).
- Tests (node:test, zero dependencies): hook case table over two fixture manifests, schema fixtures and mutants,
  skill frontmatter parity, and a repo-literal tripwire.
- CI: tests, `claude plugin validate . --strict` when the CLI installs, version-bump check on PRs to `main`.
