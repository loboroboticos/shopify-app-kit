---
name: doctor
description: Validate this repo's .claude/shopify-app.json against the kit schema, print its app facts, report vendored-hook or settings drift, check the two companions (the Shopify plugin and the graphify skill), and report the liveness of every scheduled workflow. Use when starting work in a Shopify app repo, after a kit sync, when a guard hook blocked something unexpectedly, or before creating the routine triggers.
allowed-tools: Read, Grep, Glob, Bash(jq *), Bash(cat *), Bash(bash *), Bash(sed *), Bash(ls *), Bash(claude plugin list), Bash(gh run list *), Bash(gh workflow list *)
---

# shopify-app-kit doctor

Checks the consumer repo you are in, never the kit itself. Report findings as a short list; edit nothing.

## Steps

1. **Find the manifest.** Read `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json`. If it does not exist this repo is
   not a kit consumer: say so, point at the README's adoption section, and stop.

2. **Validate it.** Run the kit's structural check, which is the same one the SessionStart hook runs:

   ```bash
   echo "{\"cwd\":\"${CLAUDE_PROJECT_DIR}\"}" | bash "${CLAUDE_PLUGIN_ROOT}/hooks/doctor.sh"
   ```

   Then compare the manifest with `${CLAUDE_PLUGIN_ROOT}/schemas/shopify-app.v1.schema.json` for anything the
   structural check does not cover: unknown top-level keys (the top level is closed), `configs.dev` / `configs.deploy`
   present whenever the matching policy is `config-required`, `apiVersion.expected` shaped like `2026-07`,
   `packageManagers` values in `npm | pnpm`.

3. **Print the facts.** From the manifest: app name and kind, default and protected branches, promotion, Shopify CLI
   configs and the four policies (`devPolicy`, `deployPolicy`, `configUsePolicy`, `themeDevFromRoot`), package
   managers by directory, expected API version, deploy targets. Keep it to one paragraph.

4. **Check vendored hooks.** For every `${CLAUDE_PROJECT_DIR}/.claude/hooks/kit/*.sh`, line 2 must read
   `# shopify-app-kit v<kit.version>` where `kit.version` comes from the manifest. Report each mismatch or missing
   file (expected: `lib.sh` plus every `guard-*.sh` under `${CLAUDE_PLUGIN_ROOT}/hooks/`). Compare `kit.version` with the
   plugin's version in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`; a lower `kit.version` means a sync is due.

5. **Check settings registration.** `${CLAUDE_PROJECT_DIR}/.claude/settings.json` must register each vendored
   `guard-*.sh` under `hooks.PreToolUse` with matcher `Bash` and command
   `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/kit/<guard>.sh"`. A guard that is vendored but not registered never
   fires. Also confirm `enabledPlugins` pins `shopify-app-kit@shopify-app-kit`.

6. **Check the companions.** The hook's output from step 2 carries the `Companion:` lines: a warning when
   `claude plugin list` does not list `shopify-ai-toolkit` (the fix is the install command it prints), an info
   line while `~/.config/shopify-ai-toolkit/opt-out` is absent (telemetry is on; the line says how to opt out),
   and a warning when graphify is absent (no `graphify` on PATH, no `skills/graphify/SKILL.md` under the Claude
   config dir or the repo; the fix is the pinned `pip install graphifyy==<pin> && graphify install` it prints).
   Findings, not blockers; nothing to report without the `claude` binary. The split is in `references/companion.md`.

7. **Check the scheduled workflows.** With `gh` on PATH the hook prints one `Schedule:` line per workflow under
   `.github/workflows/` carrying `schedule:`, with the age of its last successful run and a warning past twice
   the cadence read from the cron (daily 2 days, weekly 14, monthly 60); "no successful run on record" and "gh
   could not list workflow runs" are findings too. GitHub disables schedules in a repository idle for 60 days,
   so a stale line means dispatch it and check it is enabled. Silent without `gh`.

8. **Report.** One line per problem, each with the fix: repair the manifest key, run `/shopify-app-kit:sync`, add
   the settings snippet, install a companion, or dispatch a stale workflow. If everything is clean, say so in one line.

## References

- `references/companion.md`: the Shopify companion plugin, the graphify skill and the kit: the split, where the kit's skills call them, the `graph/` branch, install and opt-out.
