---
name: new-app
description: Scaffold a new Shopify app repo. Runs shopify app init from the official React Router template (or clones it when init needs an account), applies the kit's repo shell from templates/ with the placeholders substituted (manifest, vendored guards, CI, secret scanning, docs map, ADR seeds), makes the edits a public app needs (expiring offline tokens, Postgres datasource, first ADR), verifies the result, and makes one local commit. Never creates the remote, the Partner registration, the hosting app, the database project or a secret; those are printed as the maintainer's checklist. Use when starting a Shopify app from scratch, when asked to scaffold or bootstrap an app repo, or to preview the shell with --dry-run.
disable-model-invocation: true
argument-hint: "<app-name> [--server-dir <dir>] [--pm npm|pnpm] [--default-branch <b>] [--protected-branch <b>] [--dry-run <dir>]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(shopify app init *), Bash(git *), Bash(node *), Bash(npm *), Bash(pnpm *), Bash(bash *), Bash(claude plugin *)
---

# shopify-app-kit new-app

A new app is the official template plus this kit's shell, applied by scripts so every app starts the same way. The
skill never touches an account (step 6 prints the maintainer's checklist). Depth: `references/scaffold.md`; earlier code: `references/carry-over.md`.

## Steps

1. **Preconditions, before anything is written.** `shopify version` succeeds (the CLI is on PATH); the target
   `./<slug>` (the app name lower-cased, runs of non-alphanumerics to `-`) is absent or empty; `--pm` is `npm`
   (default) or `pnpm`; `--server-dir` is `.` (default) or a relative directory; each branch name passes
   `git check-ref-format --branch`; `--default-branch` defaults to `main` and `--protected-branch` to the default
   branch (single-branch model); a different protected branch makes the promotion pair. Stop on any failure.
2. **Get the template.** Run `shopify app init --help` and use only flags it lists; the current CLI takes
   `--template=https://github.com/Shopify/shopify-app-template-react-router --name "<app-name>" --path <dir>
   --package-manager <pm>` (with `--server-dir`, the path is `<dir>/<server-dir>`). The Bash tool is
   non-interactive, so init also asks for `--organization-id` or `--client-id` plus a login, which create or
   link the app in the maintainer's account: never supply them. When init refuses, clone the template instead
   (scaffold.md, "The clone fallback"); `client_id` stays empty until the maintainer runs `shopify app config link`.
3. **Apply the overlay.** `node ${CLAUDE_PLUGIN_ROOT}/skills/new-app/scripts/apply-overlay.mjs --target <dir>
   --app-name "<name>" --pm <pm> --server-dir <d> --default-branch <b> --protected-branch <b>
   --template-ref "<url>#<commit>"` copies every file `templates/README.md` lists with `{{APP_NAME}}`,
   `{{DEFAULT_BRANCH}}`, `{{PROTECTED_BRANCH}}`, `{{PACKAGE_MANAGER}}` and `{{SERVER_DIR}}` substituted and
   `{{GITLEAKS_VERSION}}` / `{{GITLEAKS_SHA256}}` left as a TODO (both come from the gitleaks release's
   `checksums.txt`); never overwrites a template file (text gets a delimited kit section, JSON is deep-merged,
   the rest is set aside as `<file>.shopify-app-kit`); then, as `sync` does, vendors `lib.sh` and every
   `guard-*.sh` into `.claude/hooks/kit/` and stamps `kit.version` and the tag `$schema` URL. Read its report.
4. **Post-scaffold edits.** The same run checks `future.expiringOfflineAccessTokens: true` in the Shopify
   server module and `refreshToken` / `refreshTokenExpires` on the session model (mandatory for public apps
   created on or after 2026-04-01) and adds them when missing; points the Prisma datasource at Postgres; writes
   `docs/README.md` with the `docs.mapHeading` section, `docs/adr/0001-scaffold.md` (template, kit version, the
   SEEDS still open) with its index row, and `.github/ISSUE_TEMPLATE/`. Open every `edit` line's file and confirm.
5. **Verify before committing.** From `<dir>`: `node --test test/docs-consistency.test.mjs`;
   `node ${CLAUDE_PLUGIN_ROOT}/skills/new-app/scripts/validate-manifest.mjs .claude/shopify-app.json` (against
   `${CLAUDE_PLUGIN_ROOT}/schemas/shopify-app.v1.schema.json`); `bash
   ${CLAUDE_PLUGIN_ROOT}/skills/new-app/scripts/smoke-guards.sh <dir>` (each guard exits 0 on a benign command
   and 2 on `shopify app deploy` without `--config`, a push to the protected branch, the wrong package manager).
   `claude plugin validate` is for plugins, not consumers; skip it. A failure is fixed, never skipped.
6. **Commit and hand over.** `git init -b <default-branch>` when init did not create the repo, else
   `git branch -M <default-branch>`; one commit `Scaffold <app-name> from the Shopify React Router template with
   the shopify-app-kit shell (kit vX.Y.Z)`, the version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.
   Print scaffold.md's checklist: remote and push; registration and `shopify app config link` (then the manifest's
   config and toml names); hosting app; database with the two roles (`DIRECT_DATABASE_URL` owner, `DATABASE_URL`
   runtime, per `tenancy`) and the first migration; secrets; gitleaks pin; branch protection; first `/shopify-app-kit:doctor`;
   labels synced, the queue issue pinned, the app appended to the kit's `portfolio.json` and its routines created (by hand).
7. **`--dry-run <dir>`.** Steps 2 to 5 into `<dir>` (a scratch directory), no `git init`, no commit; finish with
   the overlay's `--print-tree` output and its TODO list, so the shell can be read before a real run.

## References and scripts

- `references/scaffold.md`: the template, init flags, the clone fallback, merge rules, the manifest, edits, verification, checklist.
- `references/carry-over.md`: bringing code from an earlier attempt into the scaffold without its tooling.
- `scripts/apply-overlay.mjs`, `scripts/validate-manifest.mjs`, `scripts/smoke-guards.sh`: zero dependencies.
