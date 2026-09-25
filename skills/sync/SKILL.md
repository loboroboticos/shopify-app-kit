---
name: sync
description: Vendor the kit's guard hooks into this repo's .claude/hooks/kit/, stamp their version headers, record kit.version in .claude/shopify-app.json, and print the settings.json registration snippet. Use when adopting the kit in a repo or after upgrading the pinned kit version.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(jq *), Bash(cp *), Bash(mkdir *), Bash(ls *), Bash(cat *), Bash(diff *), Bash(bash *)
---

# shopify-app-kit sync

Guards are vendored so they fire even when the plugin has not loaded (a fresh clone, a session without the
marketplace); the plugin itself registers only the SessionStart doctor. This skill copies the hooks, never edits
their logic, and touches nothing outside `.claude/`.

## Steps

1. **Preconditions.** `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` exists and validates (run the `doctor`
   skill if unsure). Read the kit version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.
2. **Copy the hooks.** `mkdir -p "${CLAUDE_PROJECT_DIR}/.claude/hooks/kit"`, then
   `cp "${CLAUDE_PLUGIN_ROOT}/hooks/lib.sh" "${CLAUDE_PLUGIN_ROOT}"/hooks/guard-*.sh "${CLAUDE_PROJECT_DIR}/.claude/hooks/kit/"`.
   When files already existed, show a `diff -r` before and after so local edits are noticed (they are lost by
   design: the kit is the source of truth; repo-specific behaviour belongs in the manifest). Then delete every
   `.claude/hooks/kit/guard-*.sh` with no counterpart under `${CLAUDE_PLUGIN_ROOT}/hooks/` (a guard the kit
   removed) together with its `settings.json` entry, and say which; the doctor reports such a copy as stale.
3. **Stamp the headers.** Line 2 of every copied file is `# shopify-app-kit v<version>`. The kit ships them
   stamped; verify with `sed -n '2p' "${CLAUDE_PROJECT_DIR}"/.claude/hooks/kit/*.sh` and fix any that differ.
   Consumers' tripwire tests compare this line with the manifest's `kit.version`.
4. **Record the version.** Set `kit.version` in the manifest to the plugin version (`jq --arg v "$version"
   '.kit.version = $v'`, written back with the file's existing formatting where possible).
5. **Print the registration snippet** and ask the user to merge it into `${CLAUDE_PROJECT_DIR}/.claude/settings.json`
   when `hooks.PreToolUse` does not already register the guards (the doctor reports this): one entry per
   `guard-*.sh` copied, none for `lib.sh` (it is sourced). A consumer upgrading from a kit with fewer guards adds
   the new entry by hand; the doctor does not notice a missing entry while one guard is registered.

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-shopify-cli.sh\"" },
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-protected-branch.sh\"" },
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-package-manager.sh\"" },
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-migrations.sh\"" }
           ]
         }
       ]
     }
   }
   ```

6. **Verify.** Run one blocked and one allowed case through each vendored guard, for example
   `printf '{"tool_name":"Bash","tool_input":{"command":"shopify app deploy"},"cwd":"%s"}' "${CLAUDE_PROJECT_DIR}" | bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/kit/guard-shopify-cli.sh"; echo "exit $?"`,
   which expects exit 2 and a `Blocked by shopify-app-kit/guard-shopify-cli:` message under a `config-required`
   or `operator-only` deploy policy; likewise `git push origin <protected>` through `guard-protected-branch.sh`,
   `pnpm install` from a directory mapped to `npm` through `guard-package-manager.sh`, and `npx prisma migrate
   reset` through `guard-migrations.sh`. Then run the `doctor` skill and confirm it reports no drift.
7. **Commit** `.claude/hooks/kit/`, the manifest and the settings change together, with a message like
   `chore: sync shopify-app-kit v<version> hooks`.
