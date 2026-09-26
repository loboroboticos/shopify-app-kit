# Scaffolding a new app

The `new-app` skill produces a repository that is the official Shopify template with this kit's shell on top,
in one local commit. Everything below is the detail behind its seven steps.

## What the template gives

`shopify-app-template-react-router` is Shopify's recommended starting point: React Router 7 with file routes,
Polaris web components, Prisma session storage through `@shopify/shopify-app-session-storage-prisma`, the
current `@shopify/shopify-app-react-router` release, an embedded-app shell (`app/routes/app.tsx`), the two
webhook routes every app needs (`app/uninstalled`, `app/scopes_update`), a `shopify.app.toml` with an empty
`client_id`, `shopify.web.toml.liquid` (rendered by init into the dev commands), and `.mcp.json` pointing at
the Shopify Dev MCP. It also carries files that are about the template repository itself, not about your app:
`.claude/skills/` for triaging the template's GitHub issues, `.cursor/`, `.gemini/`. Remove those three in the
scaffold commit; nothing in the app reads them.

The template already sets `future.expiringOfflineAccessTokens: true` and gives the `Session` model
`refreshToken` and `refreshTokenExpires`; the overlay checks rather than assumes, because a template pinned
to an older commit does not. Its Prisma datasource is SQLite; the shell wants Postgres (see the edits below).

## The init command and its flags

Read `shopify app init --help` first and use only the flags it prints. On the current CLI (4.x) the relevant
ones are `--template <url>`, `--name <value>`, `--path <dir>`, `--package-manager npm|pnpm`, `--flavor` (only
when the template offers flavors), `--client-id` and `--organization-id`. Init strips the template's `.git`,
`.github`, `.gitmodules` and `LICENSE*`, keeps only the chosen package manager's lockfile, renders every
`*.liquid` file (`shopify.web.toml.liquid` becomes `shopify.web.toml` with `<pm> exec` commands), sets
`package.json` `name` to the slug, installs dependencies and initialises a git repository with its own first
commit.

In a non-interactive shell (the Bash tool) init requires `--organization-id`, which creates the app in the
Dev Dashboard, or `--client-id`, which links an existing one, and a logged-in CLI. Both act on the maintainer's
account, so the skill never passes them and never runs `shopify auth login`.

## The clone fallback

When init cannot run without an account, the same files come from a clone:

```bash
git clone --depth 1 https://github.com/Shopify/shopify-app-template-react-router <dir>
git -C <dir> rev-parse HEAD            # record it as --template-ref "<url>#<commit>"
rm -rf <dir>/.git <dir>/.github <dir>/.gitmodules <dir>/LICENSE*
```

Then render `shopify.web.toml.liquid` by hand into `shopify.web.toml` (`predev = "<pm> exec prisma generate"`,
`dev = "<pm> exec prisma migrate deploy && <pm> exec react-router dev"`, `npm` spelled as `npm exec`), delete
the `.liquid` file, set `package.json` `name` to the slug, and run `<pm> install`. `client_id` in
`shopify.app.toml` stays empty; `shopify app config link`, run by the maintainer, fills it and writes the named
`shopify.app.<config>.toml` files the manifest expects.

## The overlay's merge rules

`scripts/apply-overlay.mjs` walks `templates/` (every file `templates/README.md` lists; `README.md` itself and
`docs/README-docs-map.md` are handled specially) and, per file:

- **Absent in the target:** written, with the five placeholders substituted. `{{GITLEAKS_VERSION}}` and
  `{{GITLEAKS_SHA256}}` stay as they are and the report ends with the TODO: open the gitleaks release you pin,
  take the `linux_x64` tarball's line from its `checksums.txt`, paste both into `secret-scan.yml`.
- **Present and written by the kit on an earlier run** (it carries the `(shopify-app-kit template)` header and
  no overlay section): refreshed. Re-running the overlay is safe.
- **Present from the template, text** (`.md`, `.toml`, `.gitignore`, `.env.example`, `.txt`): the kit's content
  is appended as a section between `shopify-app-kit overlay: begin` and `end` markers; a re-run replaces the
  section. The template's `CLAUDE.md` (`@AGENTS.md`) keeps its line and gains the kit's file below it.
- **Present from the template, JSON:** deep-merged, the template's values winning on a conflict, arrays
  concatenated without duplicates.
- **Present from the template, anything else** (a workflow, a script): the kit's version lands next to it as
  `<file>.shopify-app-kit` and the report marks it `aside`; the maintainer reconciles by hand. Because init
  strips `.github/`, this does not happen with the current template.
- **The starter manifest:** never merged; if one exists already it is set aside the same way.

The overlay then vendors `hooks/lib.sh` and every `hooks/guard-*.sh` into `.claude/hooks/kit/` (always
overwritten: the kit is their source of truth) and makes `.sh` files executable.

## The manifest after the overlay

`.claude/shopify-app.json` starts from `templates/.claude/shopify-app.json` and gets: `kit.version` set to the
plugin version and `$schema` pointed at that version's tag; `shopifyCli.configs` `example-dev` / `example`
renamed to `<slug>-dev` / `<slug>`, and the `shopify.app.example*.toml` entries of `paths.appTomls` and
`apiVersion.pins` renamed alike (prefixed with the server directory when it is not `.`); `paths.*` normalised
(`./app/...` becomes `app/...`); `branches.promotion` set to `{ from: default, to: protected }` when the two
differ, `null` otherwise. `app.handles` keeps the example values until the app has an extension; the dev handle
must not share the production handle's prefix (`dev-loop`'s `cli-traps.md`). After `config link` the maintainer
aligns the config names with the tomls the CLI wrote, or renames the tomls; the guard blocks `app dev` and
`app deploy` until the manifest and the `--config` value agree.

## Post-scaffold edits

- `future.expiringOfflineAccessTokens: true` in the Shopify server module and `refreshToken String?` /
  `refreshTokenExpires DateTime?` on the session model: required for public apps created on or after
  2026-04-01 and for all public apps from 2027-01-01 (`tenancy`'s `expiring-tokens.md`). The overlay inserts
  the flag into an existing `future:` block or adds one after `shopifyApp({`, and adds the columns before the
  model's closing brace. Confirm both by reading the files.
- The Prisma datasource becomes `postgresql` with `url = env("DATABASE_URL")` (runtime role) and
  `directUrl = env("DIRECT_DATABASE_URL")` (owner role, migrations only). The template's SQLite migration
  cannot run on Postgres and is deleted; the first Postgres migration is generated once the database project
  exists and also creates the two roles and the isolation canary (`tenancy`'s `rls-fail-closed.md`).
- `docs/README.md` carries the `docs.mapHeading` section with a row per file that exists under `docs/`; the
  four suggested reference docs wait in a comment until they are written. `docs/history/` exists so its row
  resolves. `test/docs-consistency.test.mjs` passes on the fresh scaffold.
- `docs/adr/0001-scaffold.md` records the template reference, the kit version, the branch model and every
  seed decision still open, with its row in `docs/adr/README.md`. Each seed becomes its own record before the
  code that depends on it.
- `.github/ISSUE_TEMPLATE/work-item.md` and `config.yml` are in place; the dependabot server blocks are dropped
  when the server is the repo root.

## Verification

From the new repo: `node --test test/docs-consistency.test.mjs`; `node <plugin>/skills/new-app/scripts/
validate-manifest.mjs .claude/shopify-app.json` (the same validator the kit's tests use, plus a check that no
placeholder survived); `bash <plugin>/skills/new-app/scripts/smoke-guards.sh <dir>`, which feeds each vendored
guard a PreToolUse JSON payload on stdin exactly as `test/hooks.test.mjs` does and expects exit 0 with no
stderr on `ls -la && git status`, exit 2 through `guard-shopify-cli` on `shopify app deploy`, exit 2 through
`guard-protected-branch` on `git push origin <protected>`, and exit 2 through `guard-package-manager` on the
other package manager in the server directory. `claude plugin validate` validates plugins, not consumers.

## The maintainer's checklist

Printed after the commit, in the order the pieces depend on each other:

1. Create the GitHub repository, add it as `origin`, push `<default-branch>`.
2. Register the app in the Dev Dashboard (distribution is one-way: `admin-api`'s `distribution-is-one-way.md`),
   then `shopify app config link` for the production and the dev registration, and align
   `shopifyCli.configs`, `paths.appTomls` and `apiVersion.pins` with the tomls it wrote.
3. Create the hosting app and note its release command (migrations run there, never on boot).
4. Create the database project with two roles: an owner role on `DIRECT_DATABASE_URL` for migrations and a
   runtime role without `BYPASSRLS` on `DATABASE_URL` (`tenancy`'s `rls-fail-closed.md`); generate the first
   Postgres migration with both roles and the isolation canary; run CI's migrate rehearsal.
5. Set every secret in the hosting app and in GitHub Actions; `.env.example` says which values are secret.
6. Pin gitleaks in `secret-scan.yml` (version and checksum).
7. Enable branch protection on `<protected-branch>` when the plan allows it; the vendored guard blocks the
   session side regardless.
8. Open a session and run `/shopify-app-kit:doctor`: no drift, both companions installed.
9. Sync the labels (`node <plugin>/scripts/sync-labels.mjs --repo <owner>/<repo>`), pin the maintainer's queue
   issue, and set `kit.portfolioId` (an opaque id, never the business name) and `kit.routines` in the manifest so
   the cross-repo routines discover the app (`routines/REGISTRY.md`, "Discovering the portfolio"); then create
   the routine triggers from the registry. All by hand: the skill touches no other repository.

## Why the skill never touches an account

Every account action (a repository, a registration, a hosting app, a database, a secret, a charge) is a
`human:account` rung in the work-item ladder: irreversible or billable, tied to a person's credentials, and
invisible to a later reader unless a person did it deliberately. The scaffold therefore ends at one local
commit, and the checklist names each account step so nothing is done implicitly by a tool that happened to be
logged in.

Sources: app-1 (ops doc: registration and hosting setup order); app-3 (rebuild plan: fresh template over a fork, two database roles from the first migration); app-2 (contributor guide: what a scaffold may and may not create).
