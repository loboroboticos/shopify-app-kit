---
name: sync
description: Vendor the kit's guard hooks into this repo's .claude/hooks/kit/, stamp their version headers, record kit.version in .claude/shopify-app.json, and print the settings.json registration snippet. Use when adopting the kit in a repo or after upgrading the pinned kit version.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(jq *), Bash(cp *), Bash(mkdir *), Bash(ls *), Bash(cat *), Bash(diff *), Bash(bash *)
---

# shopify-app-kit sync

Guards are vendored so they fire even when the plugin has not loaded (a fresh clone, a session without the
marketplace). The plugin itself registers only the SessionStart doctor. This skill copies the hooks, never edits
their logic, and touches nothing outside `.claude/`.

## Steps

1. **Preconditions.** `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` must exist and validate (run the `doctor`
   skill first if unsure). Read the kit version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.

2. **Copy the hooks.** Everything a vendored guard needs travels with it:

   ```bash
   mkdir -p "${CLAUDE_PROJECT_DIR}/.claude/hooks/kit"
   cp "${CLAUDE_PLUGIN_ROOT}/hooks/lib.sh" "${CLAUDE_PLUGIN_ROOT}"/hooks/guard-*.sh "${CLAUDE_PROJECT_DIR}/.claude/hooks/kit/"
   ```

   Show a `diff -r` of `.claude/hooks/kit/` before and after when files already existed, so local edits are noticed
   (they are lost by design: the kit is the source of truth; repo-specific behaviour belongs in the manifest).

3. **Stamp the headers.** Line 2 of every copied file must be `# shopify-app-kit v<version>` where `<version>` is the
   plugin version from step 1. The kit ships them stamped; verify with
   `sed -n '2p' "${CLAUDE_PROJECT_DIR}"/.claude/hooks/kit/*.sh` and fix any that differ. Consumers' tripwire tests
   compare this line with the manifest's `kit.version`.

4. **Record the version.** Set `kit.version` in `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` to the plugin version
   (`jq --arg v "$version" '.kit.version = $v'`, written back with the file's existing formatting where possible).

5. **Print the registration snippet** and ask the user to merge it into `${CLAUDE_PROJECT_DIR}/.claude/settings.json`
   if `hooks.PreToolUse` does not already register the guards (the doctor reports this):

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-shopify-cli.sh\"" },
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-protected-branch.sh\"" },
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-package-manager.sh\"" }
           ]
         }
       ]
     }
   }
   ```

   One entry per `guard-*.sh` that was copied (currently `guard-shopify-cli.sh`, `guard-protected-branch.sh`,
   `guard-package-manager.sh`). Do not register `lib.sh`; it is sourced by the guards.

6. **Verify.** Run one blocked and one allowed case through the vendored guard, for example:

   ```bash
   printf '{"tool_name":"Bash","tool_input":{"command":"shopify app deploy"},"cwd":"%s"}' "${CLAUDE_PROJECT_DIR}" \
     | bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/kit/guard-shopify-cli.sh"; echo "exit $?"
   ```

   Expect exit 2 with a `Blocked by shopify-app-kit/guard-shopify-cli:` message under a `config-required` or
   `operator-only` deploy policy. Likewise `git push origin <protected>` through `guard-protected-branch.sh` and
   `pnpm install` from a directory mapped to `npm` (or `npm install` from one mapped to `pnpm`) through
   `guard-package-manager.sh`. Then run the `doctor` skill and confirm it reports no drift.

7. **Commit** `.claude/hooks/kit/`, the manifest and settings change together, with a message like
   `chore: sync shopify-app-kit v<version> hooks`.
