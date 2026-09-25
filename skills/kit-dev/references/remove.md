# Remove a skill, agent, hook, workflow or routine

Removal is a two-minor procedure, so a consumer meets a warning before a gap. Nothing is ever deleted in the
same version that deprecates it.

1. **Deprecate, in one minor.** The artifact stays and works. A skill or agent gets `Deprecated: <replacement or
   reason>.` as the first sentence of its `description` (the "Use when" clause stays, so the parity tests pass).
   A guard gets `# Deprecated: <replacement or reason>.` as line 3 of its header, which the doctor reads from the
   plugin's copy and reports to every consumer that still vendors it. A workflow says it in `meta.description`;
   a routine in its opening paragraph and its REGISTRY row. The CHANGELOG entry lists it under `### Deprecated`.
2. **Delete, in the next minor.** Remove the file and everything that names it: its README rows, its REGISTRY
   row, its test cases, the `sync` snippet and the doctor's guard list (both are derived from `hooks/guard-*.sh`,
   so they follow), `templates/.claude/settings.json` for a guard. Consumers' vendored copies are removed by the
   next `sync` (its stale-copy step) and reported as stale by the doctor until then. The CHANGELOG entry lists
   the removal under `### Removed`, with the version that deprecated it.
3. **Lessons whose only home was the removed file** move to `## History` in `lessons/INDEX.md` with the date and
   the reason (the existing rule: a row is never deleted).

A removal PR bumps the version like any change under a plugin-visible path.
