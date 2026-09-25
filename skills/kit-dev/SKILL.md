---
name: kit-dev
description: Maintainer guide for the shopify-app-kit repo itself, covering how to add a skill, hook, agent or lesson, run the tests, bump the version and release (tags are created on merge). Use when changing the kit's own files rather than a consumer app.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(node *), Bash(npm *), Bash(git *), Bash(claude plugin *), Bash(bash *), Bash(jq *)
---

# Developing shopify-app-kit

The repo root is the plugin root and its own marketplace (`.claude-plugin/marketplace.json`, source `./`).
Everything here is generic: per-repo facts live in each consumer's `.claude/shopify-app.json`, and
`test/no-repo-literals.test.mjs` fails on store handles, client ids, hosting app names or business names (the
private ones matched by hash, so they never appear in the kit either). Fixtures use invented names.

The kit grows by subtraction pressure and a pull loop: one source of truth per fact, kept honest by a test or a
generator and never copied into prose; an addition names the consumer evidence that pulled it; removal is a
procedure, not an accident. `test/budget.json` caps every directory and file class and only ratchets down.

## Layout

`hooks/` (lib.sh, the vendored guards, the doctor), `schemas/`, `skills/<name>/` (a SKILL.md of at most 60 lines,
depth in `references/`, mechanics in `scripts/`), `agents/`, `workflows/`, `lessons/`, `templates/`, `routines/`,
`labels.json` + `scripts/`, `portfolio.json`, `test/`. Each path's purpose and its test: `references/layout.md`.

## Procedures

- Add a guard hook, a skill, a lesson, an agent or workflow, a routine: `references/add.md`.
- Remove a skill, agent, hook, workflow or routine (deprecate in one minor, delete in the next): `references/remove.md`.
- Re-sync the review personas from upstream: `references/personas.md`.
- Release (the version sites, the CHANGELOG section, the tag on merge): `references/release.md`.

## Test and validate

```bash
npm test                              # node --test "test/**/*.test.mjs"
claude plugin validate . --strict
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate skills --strict
claude --plugin-dir .                 # then /shopify-app-kit:doctor should be listed
```

Any change under `skills/`, `agents/`, `hooks/`, `workflows/`, `schemas/`, `lessons/` or `.claude-plugin/`
bumps the version (CI enforces it on PRs to `main`); `routines/`, `templates/`, `test/` and the root files do not.
