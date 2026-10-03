---
name: sync
description: Vendor the kit's guard hooks into this repo's .claude/hooks/kit/, stamp their version headers, record kit.version in .claude/shopify-app.json, and print the settings.json registration snippet. Use when adopting the kit in a repo or after upgrading the pinned kit version.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(jq *), Bash(cp *), Bash(mkdir *), Bash(ls *), Bash(cat *), Bash(diff *), Bash(bash *), Bash(awk *)
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
   stamped; verify with `awk 'FNR==2 {print FILENAME ": " $0}' "${CLAUDE_PROJECT_DIR}"/.claude/hooks/kit/*.sh`
   (line 2 of every file) and fix any that differ.
   Consumers' tripwire tests compare this line with the manifest's `kit.version`.
4. **Record the version.** Edit the manifest in place (the Edit tool, never a `jq` rewrite, which reformats the
   file): set `kit.version` to the plugin version and, when `$schema` is present, point its ref at the tag
   (`…/shopify-app-kit/v<version>/schemas/shopify-app.v1.schema.json`). The doctor reports either one stale.
5. **Print the registration snippet** and ask the user to merge it into `${CLAUDE_PROJECT_DIR}/.claude/settings.json`
   when `hooks.PreToolUse` does not already register the guards (the doctor reports this): one entry per
   `guard-*.sh` copied under `Bash`, plus the GitHub MCP entry; none for `lib.sh` (it is sourced). A consumer
   upgrading adds a new entry by hand; the doctor reports every vendored guard that neither `settings.json` nor
   `settings.local.json` registers, and a missing MCP entry.

   ```json
   { "hooks": { "PreToolUse": [
     { "matcher": "Bash", "hooks": [
         { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-shopify-cli.sh\"" },
         { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-protected-branch.sh\"" },
         { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-package-manager.sh\"" },
         { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-migrations.sh\"" }
     ] },
     { "matcher": "mcp__.*github.*", "hooks": [ { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-protected-branch.sh\"" } ] }
   ] } }
   ```

6. **Verify.** Feed each vendored guard a blocked and an allowed case as tool-call JSON, e.g.
   `printf '{"tool_name":"Bash","tool_input":{"command":"%s"},"cwd":"%s"}' "shopify app deploy" "${CLAUDE_PROJECT_DIR}" | bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/kit/guard-shopify-cli.sh"; echo "exit $?"`
   (2 blocked, 0 allowed). Blocked, then allowed: `shopify app deploy` (config-required deploy policy), `npm run
   build`; `git push origin <protected>`, `git status`; `pnpm install` in an `npm` directory, its own manager's
   install; `npx prisma migrate reset`, `npx prisma migrate status`. MCP: `{"tool_name":"mcp__github__merge_pull_request",
   "tool_input":{"owner":"o","repo":"r","pullNumber":1},"cwd":"<repo root>"}` through `guard-protected-branch.sh` exits 2. Then run the
   `doctor` skill and confirm it reports no drift.
7. **Commit** `.claude/hooks/kit/`, the manifest and the settings change together on a branch, with a message
   like `chore: sync shopify-app-kit v<version> hooks`, and open a PR to `branches.default`; never commit to a
   protected branch.
