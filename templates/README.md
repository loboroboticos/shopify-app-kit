# templates/

The repo shell a new Shopify app starts from. `shopify app init` gives the application code; these files give
the repository around it: CI that rehearses migrations, secret scanning from a pinned binary, a dependency audit
that opens issues instead of failing silently, an issue template that names who can close a piece of work, an
`.env.example` that says which value is public, a docs map with the test that keeps it honest, the ADR shape and
the decisions a new app must take first, and the `.claude/` wiring that pins this kit.

Every file is generic and written from the kit's own lessons (`lessons/INDEX.md`), never copied from a consumer.
Every file starts with a short header saying what it is and which manifest key it reads or which test guards it.
`test/templates.test.mjs` checks this directory: every file is listed below, every placeholder used is in the
table, the starter manifest validates against the schema once the placeholders are substituted, JSON and YAML
files parse, and no repo literal appears.

`/shopify-app-kit:new-app` applies these after
`shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router` through
`skills/new-app/scripts/apply-overlay.mjs`, substituting the placeholders from its arguments, never overwriting
a template file (text gets a delimited kit section, JSON is deep-merged, anything else is set aside), vendoring
the guards and stamping the manifest. The same script works by hand:
`node <plugin>/skills/new-app/scripts/apply-overlay.mjs --target <dir> --app-name "<name>" [--pm npm|pnpm]
[--server-dir .] [--default-branch main] [--protected-branch main]`.

## Placeholders

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `{{APP_NAME}}` | The app's display name (`app.name` in the manifest). | `Example App` |
| `{{DEFAULT_BRANCH}}` | The branch sessions work on and PRs target (`branches.default`). | `main` |
| `{{PROTECTED_BRANCH}}` | The branch only a human lands (`branches.protected[0]`); equals the default branch in a single-branch repo. | `main` |
| `{{PACKAGE_MANAGER}}` | `npm` or `pnpm`, the one entry of `packageManagers` for the server directory. | `npm` |
| `{{SERVER_DIR}}` | Repo-relative directory of the app server (`paths.server`); `.` when the app is at the root. | `.` |
| `{{GITLEAKS_VERSION}}` | The gitleaks release to pin, without the `v`. Read it once from the release page. | `8.24.3` |
| `{{GITLEAKS_SHA256}}` | The SHA-256 of that release's `linux_x64` tarball, from its `checksums.txt`. | 64 hex characters |

## Files

| Template | Purpose | Reads / guarded by |
| --- | --- | --- |
| `.github/workflows/ci.yml` | The verify gate on every PR: frozen install, audit, `prisma generate`, typecheck, test, build; a second job rehearses `prisma migrate deploy` from an empty database and fails on schema drift. Reusable through `workflow_call`. | `branches.*`, `paths.server`, `packageManagers` |
| `.github/workflows/secret-scan.yml` | Gitleaks over the full history on every PR and weekly, from a version-pinned, checksum-verified release tarball. | `.gitleaks.toml` |
| `.github/workflows/dependency-audit.yml` | Weekly dependency audit; a High or Critical finding opens or comments an issue through the failure-issue action and the run stays green. | `.github/actions/failure-issue` |
| `.github/actions/failure-issue/action.yml` | Composite action: search open issues, comment on the match or create one. Idempotent per open issue. | `issues: write` |
| `.github/dependabot.yml` | Weekly bumps for actions, npm (root and server) and docker; minor and patch grouped; framework majors ignored as deliberate migrations. | `paths.server` |
| `.github/ISSUE_TEMPLATE/work-item.md` | The work-item template with the "Close condition needs" ladder and the irreversibility check. | `.claude/rules/pr-and-issues.md` |
| `.github/ISSUE_TEMPLATE/config.yml` | Disables blank issues so every item states its close condition. | `work-item.md` |
| `.gitleaks.toml` | Gitleaks config: defaults plus a rule for connection URIs with embedded credentials; narrow allowlists that each say why. | `secret-scan.yml` |
| `.env.example` | Every environment variable with whether it is public, a real secret or a local marker; the database fingerprint the dev command must check before migrating. | `database.*`, `auth.*` |
| `docs/README-docs-map.md` | The shape of the "Docs map" section: one row per file under `docs/`, one owner per fact. `new-app` writes it to `docs/README.md` (`docs.mapFile`) with only the rows whose file exists. | `docs.mapFile`, `docs.mapHeading` |
| `test/docs-consistency.test.mjs` | Fails when a file under `docs/` is missing from the map or a reference doc carries a dated heading; allowlist that only shrinks; repair string in every message. | `docs.*` |
| `docs/adr/README.md` | The ADR series index and its rules (MADR-lite, one decision per file, newest number wins). | `docs.adrDir` |
| `docs/adr/0000-template.md` | The record to copy for a new decision. | `docs/adr/README.md` |
| `docs/adr/SEEDS.md` | The decisions a new Shopify app takes before Phase 1, each as a title and a question, no answers. | `lessons/INDEX.md` (`adr-seed` rows) |
| `.claude/settings.json` | Pins the kit marketplace and plugin, registers the three vendored guards and the bootstrap hook. | `.claude/hooks/kit/*.sh` |
| `.claude/hooks/kit-bootstrap.sh` | SessionStart hook for remote sessions: installs the kit and the official Shopify companion plugin when absent, writes the telemetry opt-out, never fails the session. | `.claude/settings.json` |
| `.claude/shopify-app.json` | The starter manifest: expiring offline tokens on, App Pricing, RLS Postgres, the docs map in `docs/README.md`. `new-app` stamps `kit.version` and the tag `$schema`, and renames the `example` configs and tomls to the app's slug. | `schemas/shopify-app.v1.schema.json` |
| `.claude/rules/billing.md` | Path-scoped rule seed: billing method, test flag, plan names as data. | `billing.*` |
| `.claude/rules/prisma.md` | Path-scoped rule seed: migrations own RLS and roles, no `db push`, the drift check. | `database.*`, `paths.prisma` |
| `.claude/rules/docs.md` | Path-scoped rule seed: one owner per fact, no dates in reference docs, ADRs. | `docs.*` |
| `.claude/rules/pr-and-issues.md` | Path-scoped rule seed: the close-condition ladder, `human:*` issues, PR shape. | `work-item.md` |
| `CLAUDE.md` | The always-loaded instructions file: what this is, commands, hard constraints naming their hook, pointers. Stays under 200 lines. | `.claude/rules/*.md` |
