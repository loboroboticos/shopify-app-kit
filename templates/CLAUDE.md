# {{APP_NAME}}

<!-- CLAUDE.md (shopify-app-kit template). The always-loaded instructions file. It stays under 200 lines and
     holds only what a session needs most of the time; mechanics move to path-scoped .claude/rules/*.md, facts
     to the document that owns them (see the Docs map in docs/README.md). The manifest .claude/shopify-app.json owns
     every tooling fact; do not restate its values here. -->

## What this is

A Shopify embedded app built on React Router and Prisma, scaffolded from the official Shopify template with the
shopify-app-kit repo shell. Multi-tenant on one Postgres database with row-level security; expiring offline
access tokens; App Pricing. The repo-specific facts (configs, branches, policies, pins, topics, targets) live in
`.claude/shopify-app.json`; the kit's guard hooks, doctor and skills read them.

## Commands

```bash
{{PACKAGE_MANAGER}} install                      # from {{SERVER_DIR}}
{{PACKAGE_MANAGER}} run dev                      # shopify app dev with the dev config (the dev-loop skill)
{{PACKAGE_MANAGER}} run typecheck && {{PACKAGE_MANAGER}} test
{{PACKAGE_MANAGER}} exec prisma migrate dev      # local database only; refuses without DEV_DATABASE_FINGERPRINT
```

## Hard constraints

Each is enforced by the named hook or test; the sentence here is the pointer, not the rule.

- `shopify app dev` / `app deploy` carry `--config` (`guard-shopify-cli`).
- No push to or merge into `{{PROTECTED_BRANCH}}`; PRs target `{{DEFAULT_BRANCH}}` (`guard-protected-branch`).
- `{{PACKAGE_MANAGER}}` only, in `{{SERVER_DIR}}` (`guard-package-manager`).
- Every tenant-scoped query runs inside `withTenant`; the raw Prisma client is not imported elsewhere (the
  import guard and the isolation probes in CI).
- A schema change ships with its migration; CI migrates from empty and runs `migrate diff --exit-code`.
- No secret in git; `secret-scan.yml` scans the full history on every PR.
- A `human:*` issue is never closed by a session (`.claude/rules/pr-and-issues.md`).

## Pointers

- Docs map: `docs/README.md`, "Docs map" section; one owner per fact.
- Decisions: `docs/adr/` (`SEEDS.md` lists the ones still to take).
- Path-scoped rules: `.claude/rules/` (billing, prisma, docs, PRs and issues).
- Kit skills: `/shopify-app-kit:doctor`, `/shopify-app-kit:sync`, `/shopify-app-kit:review`, and the
  model-invoked `dev-loop`, `admin-api`, `tenancy`, `mcp-connector`, `tripwire`, `docs-owner`, `issue-filing`.
