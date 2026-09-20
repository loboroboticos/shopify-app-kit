---
name: kit-dev
description: Maintainer guide for the shopify-app-kit repo itself, covering how to add a skill, hook or agent, run the tests, bump the version and tag a release. Use when changing the kit's own files rather than a consumer app.
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
| `agents/<name>.md` | review subagents launched by the `review` skill; read-only, manifest-aware |
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

## Add an agent or workflow

Put agents in `agents/<name>.md` (frontmatter `name` = file name, `description` containing "Use when", `tools`).
Review agents stay read-only (`test/agents-parity.test.mjs` rejects Write/Edit tools) and generic: the
orchestrating skill passes the manifest, diff and changed files in the prompt, and the agent keys its checks to
manifest sections rather than to any repo. Any addition under `agents/`, `hooks/`, `skills/`, `schemas/`,
`workflows/`, `.mcp.json` or `.claude-plugin/` requires a version bump (CI enforces it on PRs to `main`).

## Test and validate

```bash
node --test test/
claude plugin validate . --strict
claude --plugin-dir . # then /shopify-app-kit:doctor should be listed
```

## Release

1. Bump `version` in `.claude-plugin/plugin.json` and every `# shopify-app-kit vX.Y.Z` header in `hooks/*.sh`
   (the header test fails otherwise), plus the `Cases:` line version comes from `KIT_VERSION` in `lib.sh`.
2. Add a `CHANGELOG.md` entry.
3. Open a PR to `main`; merge when CI is green.
4. Tag on `main`: `git tag vX.Y.Z && git push origin vX.Y.Z`. Consumers then run `/shopify-app-kit:sync`.
