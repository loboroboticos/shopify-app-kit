---
name: doctor
description: Validate this repo's .claude/shopify-app.json against the kit schema, print its app facts, and report vendored-hook or settings drift. Use when starting work in a Shopify app repo, after a kit sync, or when a guard hook blocked something unexpectedly.
allowed-tools: Read, Grep, Glob, Bash(jq *), Bash(cat *), Bash(bash *), Bash(sed *), Bash(ls *)
---

# shopify-app-kit doctor

Checks the consumer repo you are in, never the kit itself. Report findings as a short list; do not edit anything (the
`sync` skill and the maintainer do that).

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
   file (expected: `lib.sh` plus every `guard-*.sh` the kit ships under `${CLAUDE_PLUGIN_ROOT}/hooks/`, currently
   `guard-shopify-cli.sh`, `guard-protected-branch.sh` and `guard-package-manager.sh`). Compare `kit.version` with the plugin's own
   version in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`; a lower `kit.version` means a sync is due.

5. **Check settings registration.** `${CLAUDE_PROJECT_DIR}/.claude/settings.json` must register each vendored
   `guard-*.sh` under `hooks.PreToolUse` with matcher `Bash` and command
   `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/kit/<guard>.sh"`. A guard that is vendored but not registered never
   fires. Also confirm `enabledPlugins` pins `shopify-app-kit@shopify-app-kit`.

6. **Report.** One line per problem, each with the fix: repair the manifest key, run `/shopify-app-kit:sync`, or add
   the settings snippet the sync skill prints. If everything is clean, say so in one line.
