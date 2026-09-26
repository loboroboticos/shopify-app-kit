# Layout

| Path | Purpose |
| --- | --- |
| `hooks/lib.sh` | shared bash: manifest resolution, `block()`, path helpers, command walker with cd tracking |
| `hooks/guard-*.sh` | PreToolUse guards, vendored into consumers by `/shopify-app-kit:sync` |
| `hooks/doctor.sh` | SessionStart briefing; the only hook `hooks/hooks.json` registers |
| `schemas/` | the manifest JSON Schema; `test/schema.test.mjs` pins the draft and that only the top level is closed |
| `skills/<name>/SKILL.md` | skills; `test/skills-parity.test.mjs` holds the frontmatter, the line cap and the links |
| `skills/<name>/references/*.md` | depth for a skill (plain markdown, no frontmatter, ends with a `Sources:` line); the SKILL.md links each |
| `skills/<name>/scripts/*.{mjs,sh}` | zero-dependency scripts a skill runs, each linked from its SKILL.md and syntax-checked by the parity test; `test/new-app.test.mjs` exercises `new-app`'s against a stand-in template |
| `agents/<name>.md` | review subagents launched by the `review` skill and the review roster; read-only, manifest-aware |
| `workflows/<name>.js` | Workflow scripts (plain JavaScript, `export const meta` first) that orchestrate the agents; loaded as `/shopify-app-kit:<name>`; `test/workflows-parity.test.mjs` iterates them |
| `lessons/INDEX.md`, `lessons/README.md` | the lessons catalogue and its extraction discipline; homes are reference files or agent sections |
| `templates/` | the repo shell a new app starts from; every file listed in `templates/README.md` with its placeholders; `test/templates.test.mjs` |
| `labels.json`, `scripts/sync-labels.mjs` | the label set (with the `ladder` array) and the script that applies it with `gh label create --force`; `test/labels.test.mjs` |
| `routines/<name>.md`, `routines/REGISTRY.md` | the committed prompt texts of the scheduled Routines and the table with the trigger step; `test/routines.test.mjs` |
| `.github/workflows/release-tag.yml` | tags `v<version>` and publishes the release when a bump merges to `main` |
| `test/` | `npm test` (`node --test "test/**/*.test.mjs"`), zero dependencies |
