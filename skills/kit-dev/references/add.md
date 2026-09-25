# Adding to the kit

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
6. Register it everywhere a consumer learns the guard list: the `sync` skill's settings snippet and its "one entry
   per guard" sentence, `skills/doctor/SKILL.md` step 4, the README's "What you get" table and adoption snippet,
   `templates/.claude/settings.json` (`test/templates.test.mjs` asserts it registers exactly the guards under
   `hooks/`), and a line in `templates/CLAUDE.md`'s hard constraints. `apply-overlay.mjs` vendors `guard-*.sh` by
   glob and `hooks/doctor.sh` checks registration by prefix, so neither lists guards by name.

## Add a skill

Create `skills/<name>/SKILL.md` with frontmatter `name` (= directory), `description` (≤ 1024 chars, includes
"Use when"), optional `allowed-tools`, and `disable-model-invocation: true` for skills that only a person should
invoke. Reference consumer files as `${CLAUDE_PROJECT_DIR}/...` and kit files as `${CLAUDE_PLUGIN_ROOT}/...`.
`test/skills-parity.test.mjs` checks the frontmatter.

Every SKILL.md stays at or under 60 lines (the parity test enforces it); numbered steps that read the manifest first,
with the depth in `skills/<name>/references/<topic>.md`: plain markdown, no frontmatter, one `#`
title, `##` sections whose headings become the anchors `lessons/INDEX.md` points at, and a final
`Sources: app-1 (...); app-2 (...).` line. Every reference file must be linked from its SKILL.md and be the home of
at least one lesson; the parity and lessons tests enforce both.

A skill that must do the same thing every time (copy, substitute, validate) puts the mechanics in
`skills/<name>/scripts/` as `.mjs` (node: builtins only) or `.sh` files, each starting with a comment that names
the file and what it does, linked from the SKILL.md, and covered by a test that runs it against a fixture
(`test/new-app.test.mjs` for `skills/new-app/scripts/`). The parity test syntax-checks every script. `kit-dev`'s own references are maintainer procedures, not lessons: they
carry no `Sources:` line and need no row in `lessons/INDEX.md` (both tests exempt them).

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
`lessons/` or `.claude-plugin/` requires a version bump (CI enforces it on PRs to `main`).

## Add a routine

A routine is one file `routines/<name>.md`: `# <name>`, one paragraph, then five header fields as a list
(`- **Cadence:**` with the cron in backticks, `- **Environment:**`, `- **Tools:**`, `- **May touch:**`,
`- **Never:**`), then `## Prompt` as the last section with the prompt text verbatim. The prompt is pasted into
a `create_trigger` call with `create_new_session_on_fire: true`, so it is a complete standalone instruction: it
starts by reading `.claude/shopify-app.json` (`branches.default`, `branches.protected`,
`deploy.protectedWorkflows`) and `labels.json`, derives the repository from the git remote (never names one),
says it never closes a `human:*` issue and never relabels `human:*` to `agent:*` except per R7, never dispatches
a protected workflow, and opens at most one PR per run. Add its row to `routines/REGISTRY.md` (cron minute off
the hour and distinct from the others), list it under the placeholder product's `routines` in `portfolio.json`
when every product runs it, and extend `test/routines.test.mjs` (the file list and the boundary phrases).
`routines/` is not plugin-visible, so a routine change alone needs no version bump; the CHANGELOG still gets a line.
