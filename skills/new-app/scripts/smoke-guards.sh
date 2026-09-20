#!/usr/bin/env bash
# skills/new-app/scripts/smoke-guards.sh: proves the guards vendored into a scaffolded repo fire. Runs every
# .claude/hooks/kit/guard-*.sh with a PreToolUse payload on stdin the way test/hooks.test.mjs does: a benign
# command must exit 0 with no stderr, `shopify app deploy` without --config must exit 2 through
# guard-shopify-cli, a push to the protected branch must exit 2 through guard-protected-branch, and the wrong
# package manager in the server directory must exit 2 through guard-package-manager. Needs jq (the guards do too).
#
#   bash smoke-guards.sh <scaffolded repo root>
#
# Prints one PASS/FAIL line per case; exit 1 when any case fails.
set -uo pipefail

root="${1:-}"
[ -n "$root" ] && [ -d "$root" ] || { echo "usage: smoke-guards.sh <scaffolded repo root>" >&2; exit 1; }
root="$(cd "$root" && pwd -P)"
manifest="$root/.claude/shopify-app.json"
hookdir="$root/.claude/hooks/kit"
[ -f "$manifest" ] || { echo "FAIL no manifest at $manifest" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "FAIL jq is not installed; the guards fail closed without it" >&2; exit 1; }

export CLAUDE_PROJECT_DIR="$root"
unset SHOPIFY_APP_KIT_MANIFEST SHOPIFY_APP_KIT_ROOT

protected="$(jq -r '.branches.protected[0] // "main"' "$manifest")"
server_dir="$(jq -r '.paths.server // "."' "$manifest")"
pm="$(jq -r --arg d "$server_dir" '.packageManagers[$d] // "npm"' "$manifest")"
case "$pm" in npm) wrong="pnpm install" ;; *) wrong="npm install" ;; esac
server_abs="$root/$server_dir"
[ -d "$server_abs" ] || server_abs="$root"

failures=0
# run_case GUARD COMMAND CWD EXPECTED_EXIT [STDERR_REGEX]
run_case() {
  local guard="$1" command="$2" cwd="$3" expected="$4" pattern="${5:-}" payload status err
  payload="$(jq -cn --arg c "$command" --arg d "$cwd" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c},cwd:$d}')"
  err="$(printf '%s' "$payload" | bash "$hookdir/$guard" 2>&1 >/dev/null)"; status=$?
  if [ "$status" -ne "$expected" ]; then
    echo "FAIL $guard :: $command -> exit $status, expected $expected${err:+ ($err)}"; failures=$((failures + 1)); return
  fi
  if [ "$expected" -eq 0 ] && [ -n "$err" ]; then
    echo "FAIL $guard :: $command -> stderr on an allowed command: $err"; failures=$((failures + 1)); return
  fi
  if [ -n "$pattern" ] && ! grep -Eq "$pattern" <<<"$err"; then
    echo "FAIL $guard :: $command -> blocked for the wrong reason: $err"; failures=$((failures + 1)); return
  fi
  echo "PASS $guard :: $command -> exit $status"
}

found=0
for guard in "$hookdir"/guard-*.sh; do
  [ -f "$guard" ] || continue
  found=$((found + 1))
  run_case "$(basename "$guard")" "ls -la && git status" "$root" 0
done
[ "$found" -gt 0 ] || { echo "FAIL no guard-*.sh under $hookdir; run the overlay first"; exit 1; }

run_case guard-shopify-cli.sh "shopify app deploy" "$root" 2 "app deploy without --config|operator-only"
run_case guard-protected-branch.sh "git push origin $protected" "$root" 2 "protected branch"
run_case guard-package-manager.sh "$wrong" "$server_abs" 2 "maps to $pm"

if [ "$failures" -gt 0 ]; then echo "smoke-guards: $failures failure(s)"; exit 1; fi
echo "smoke-guards: every vendored guard fires (root $root)."
