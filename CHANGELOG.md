# Changelog

All notable changes to shopify-app-kit. The version is the plugin version in `.claude-plugin/plugin.json`; every
vendored hook carries it on line 2 (`# shopify-app-kit vX.Y.Z`).

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
