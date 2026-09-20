---
name: kit-dev
description: Maintainer guide for the shopify-app-kit repo itself, covering how to add a skill, hook, agent or lesson, run the tests, bump the version and release (tags are created on merge). Use when changing the kit's own files rather than a consumer app.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(node *), Bash(npm *), Bash(git *), Bash(claude plugin *), Bash(bash *), Bash(jq *)
---

# Developing shopify-app-kit

The repo root is the plugin root and its own marketplace (`.claude-plugin/marketplace.json`, source `./`).
Everything here is generic: per-repo facts live in each consumer's `.claude/shopify-app.json`, and
`test/no-repo-literals.test.mjs` fails on store handles, client ids, hosting app names or business names.
Fixtures use invented names (`example-app`, `example-dev`).

## Layout

| Path | Purpose |
| --- | --- |
| `hooks/lib.sh` | shared bash: manifest resolution, `block()`, path helpers, command walker with cd tracking |
| `hooks/guard-*.sh` | PreToolUse guards, vendored into consumers by `/shopify-app-kit:sync` |
| `hooks/doctor.sh` | SessionStart briefing; the only hook `hooks/hooks.json` registers |
| `schemas/` | manifest JSON Schema (draft 2020-12), `additionalProperties: false` at the top level only |
| `skills/<name>/SKILL.md` | skills; `name` must equal the directory, description must contain "Use when" |
| `skills/<name>/references/*.md` | depth for a skill (plain markdown, no frontmatter, ends with a `Sources:` line); the SKILL.md links each |
| `skills/<name>/scripts/*.{mjs,sh}` | zero-dependency scripts a skill runs, each linked from its SKILL.md and syntax-checked by the parity test; today `skills/new-app/scripts/` (`apply-overlay.mjs`, `validate-manifest.mjs`, `smoke-guards.sh`), exercised by `test/new-app.test.mjs` against a stand-in template |
| `agents/<name>.md` | review subagents launched by the `review` skill and the review roster; read-only, manifest-aware |
| `workflows/<name>.js` | Workflow scripts (plain JavaScript, `export const meta` first) that orchestrate the agents; loaded as `/shopify-app-kit:<name>` |
| `lessons/INDEX.md`, `lessons/README.md` | the lessons catalogue and its extraction discipline; homes are reference files or agent sections |
| `templates/` | the repo shell a new app starts from; every file listed in `templates/README.md` with its placeholders; `test/templates.test.mjs` |
| `.github/workflows/release-tag.yml` | tags `v<version>` and publishes the release when a bump merges to `main` |
| `test/` | `node --test test/`, zero dependencies |

## Add a guard hook

1. Create `hooks/guard-<thing>.sh` starting with `#!/usr/bin/env bash` and, on line 2, `# shopify-app-kit v<version>`
   (the header test enforces this; consumers' tripwires compare it with `kit.version`).
2. Set `KIT_HOOK_NAME=guard-<thing>` and source `lib.sh` from `$(dirname "${BASH_SOURCE[0]}")`, so the same file
   works from the plugin and from a consumer's `.claude/hooks/kit/`.
3. Exit 0 early for commands that cannot be relevant; resolve the manifest; fail closed (`block`) when it is missing,
   when jq is missing, or when a path cannot be read literally. Read policies from the manifest, never hardcode.
4. Use `kit_walk_commands "$cmd" callback` for anything that depends on the effective directory.
5. Add cases to `test/hooks.test.mjs` (both fixtures, blocked and allowed, prose false positives) and document the
   manifest keys it reads in the README's manifest contract. New manifest keys go into the schema additively.
6. Mention the new guard in the `sync` skill's registration snippet and in `skills/doctor/SKILL.md` step 4.

## Add a skill

Create `skills/<name>/SKILL.md` with frontmatter `name` (= directory), `description` (≤ 1024 chars, includes
"Use when"), optional `allowed-tools`, and `disable-model-invocation: true` for skills that only a person should
invoke. Reference consumer files as `${CLAUDE_PROJECT_DIR}/...` and kit files as `${CLAUDE_PLUGIN_ROOT}/...`.
`test/skills-parity.test.mjs` checks the frontmatter.

A skill whose steps need rationale keeps the SKILL.md short (numbered steps that read the manifest first, at most
60 lines) and puts the depth in `skills/<name>/references/<topic>.md`: plain markdown, no frontmatter, one `#`
title, `##` sections whose headings become the anchors `lessons/INDEX.md` points at, and a final
`Sources: app-1 (...); app-2 (...).` line. Every reference file must be linked from its SKILL.md and be the home of
at least one lesson; the parity and lessons tests enforce both.

A skill that must do the same thing every time (copy, substitute, validate) puts the mechanics in
`skills/<name>/scripts/` as `.mjs` (node: builtins only) or `.sh` files, each starting with a comment that names
the file and what it does, linked from the SKILL.md, and covered by a test that runs it against a fixture
(`test/new-app.test.mjs` for `skills/new-app/scripts/`). The parity test syntax-checks every script.

## Add a lesson

Lessons are facts a session needs more than once, written generically and cited only as `app-1`, `app-2` or
`app-3` (defined in `lessons/README.md`; never expand them). One owner per fact:

1. Find or create the section in the owning reference file (or the agent section, for a `lens`); write the rule
   in the present tense with the mechanism and the failure it prevents. Update the file's `Sources:` line.
2. Add one row to `lessons/INDEX.md`: `id | rule | class | home#anchor | source`, using the file's id prefix and
   the next number; class is `rule`, `recipe`, `lens` or `adr-seed`.
3. `node --test test/lessons-index.test.mjs`, then bump the version (`lessons/` is plugin-visible).
4. To retire a lesson, move its row to the `## History` section with the date and the reason; never delete it.

## Add an agent or workflow

Put agents in `agents/<name>.md` (frontmatter `name` = file name, `description` containing "Use when", `tools`,
`disallowedTools: Edit, Write, NotebookEdit`). Review agents stay read-only (`test/agents-parity.test.mjs` rejects
Write/Edit tools) and generic: the orchestrating skill or workflow passes the base, changed files and intent in the
prompt, and the agent reads the manifest and keys its checks to manifest sections rather than to any repo. Roster
agents (`design-review-*`, `qa-review-*`, the stack reviewers) also keep the four headings, the standing clause
and the shared findings shape the parity test asserts.

Put workflows in `workflows/<name>.js`: plain JavaScript (no TypeScript, no imports, no `Date.now`), the first
statement a pure-literal `export const meta = { name, description, whenToUse, phases }` with `name` = file name
and a `whenToUse` containing "Use when"; only `.js` is loaded (`.mjs`/`.ts` are skipped). Launch kit agents with
`agent(prompt, { agentType: 'shopify-app-kit:<agent>', schema })`; every such name must exist under `agents/`.
`test/workflows-parity.test.mjs` checks the meta, the phase titles and the agent names, and
`test/workflows-run.test.mjs` runs the script under a stub runtime with canned reviewer output, so add a case there
for any new branch of logic. Any addition under `agents/`, `hooks/`, `skills/`, `schemas/`, `workflows/`,
`lessons/`, `.mcp.json` or `.claude-plugin/` requires a version bump (CI enforces it on PRs to `main`).

## Test and validate

```bash
node --test test/
claude plugin validate . --strict
claude --plugin-dir . # then /shopify-app-kit:doctor should be listed
```

## Release

1. Bump `version` in `.claude-plugin/plugin.json`, `KIT_VERSION` in `hooks/lib.sh` (the `Cases:` line reads it)
   and every `# shopify-app-kit vX.Y.Z` header on line 2 of `hooks/*.sh` (the header test fails otherwise).
   `grep -rn "<old version>"` should then hit only `CHANGELOG.md`.
2. Add a `## X.Y.Z` section to `CHANGELOG.md`; the release notes are extracted from it verbatim.
3. Open a PR to `main`; merge when CI is green.
4. Do not tag. `.github/workflows/release-tag.yml` runs on the push to `main`, creates the annotated tag
   `vX.Y.Z` on the merge commit if it does not exist, and publishes the GitHub Release with the CHANGELOG
   section as its notes. An existing tag is a logged no-op. Never push a kit tag by hand; if the workflow did not
   run, fix the workflow and re-run it from the Actions tab rather than tagging locally.
5. Consumers then run `/shopify-app-kit:sync` and repoint their manifest's `$schema` at the new tag.
