# Changelog

All notable changes to shopify-app-kit. The version is the plugin version in `.claude-plugin/plugin.json`; every
vendored hook carries it on line 2 (`# shopify-app-kit vX.Y.Z`).

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
