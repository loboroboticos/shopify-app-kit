#!/usr/bin/env bash
# shopify-app-kit v0.11.0
# hooks/guard-package-manager.sh: PreToolUse(Bash) guard that keeps each directory on the package manager
# .claude/shopify-app.json maps it to (packageManagers: { "<dir>": "npm" | "pnpm" }, "." = the consumer root).
#
#   pnpm ...                                   blocked when the effective directory (after cd/pushd/popd/subshell
#                                              tracking, or pnpm -C <dir> / --dir <dir> / --dir=<dir>) maps to npm
#   npm install|ci|i|add|update|uninstall|run  blocked symmetrically when the effective directory maps to pnpm
#
# The lookup is by EXACT manifest entry (repo-relative; "." for the root): directories the manifest does not name are
# left alone, so a nested package with its own tooling is not judged by its parent's entry (nearest-ancestor lookup
# is deliberately not in this version). npx/pnpx/bunx/corepack prefixes are skipped and npx itself is never blocked.
# Anything the guard cannot read (no jq, no manifest, a cd to a non-literal path before a guarded command) fails closed.
# Vendored into consumers at .claude/hooks/kit/guard-package-manager.sh by /shopify-app-kit:sync.
set -uo pipefail

KIT_HOOK_NAME=guard-package-manager
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

kit_read_input

if ! kit_has_jq; then
  case "$input" in
    *pnpm*)
      case "$input" in
        *"cd web"*) ;;
        *) block "jq is not installed, so a pnpm command cannot be checked against the manifest's package managers (fail closed)" "Install jq (brew install jq / apt-get install jq)." ;;
      esac ;;
  esac
  exit 0
fi

kit_parse_input
case "$cmd" in *pnpm* | *npm*) ;; *) exit 0 ;; esac

RULE_CD="Which package manager applies depends on the directory; cd to a literal path first (per .claude/shopify-app.json packageManagers)."

pm_map=""
manifest_loaded=0

# ensure_manifest: resolve and read the manifest the first time a guarded command is seen (so a command that only
# mentions npm in prose never needs one), failing closed when it is missing.
ensure_manifest() {
  [ "$manifest_loaded" -eq 1 ] && return 0
  kit_resolve_manifest "$cwd"
  kit_manifest_ok || block "the repo manifest is missing or unreadable ($manifest), so the command cannot be checked (fail closed)" "$KIT_MANIFEST_RULE"
  pm_map="$(mf '.packageManagers // {} | to_entries[] | "\(.key)\t\(.value)"')"
  manifest_loaded=1
}

# pm_for DIR: the manifest's package manager for the exact repo-relative form of DIR, or nothing.
pm_for() {
  local rel key pm
  rel="$(kit_rel_to_root "$1")"
  [ -n "$rel" ] || return 0
  while IFS=$'\t' read -r key pm; do
    [ -n "$key" ] || continue
    if [ "$key" = "$rel" ]; then printf '%s' "$pm"; return 0; fi
  done <<<"$pm_map"
}

rule_for() { printf 'Use %s in %s (per .claude/shopify-app.json packageManagers); a second package manager writes a second lockfile and a second node_modules layout.' "$1" "$2"; }

# check_pm PROG DIR ARGS...: DIR is the effective directory ("" when it cannot be read literally); PROG is npm or pnpm.
check_pm() {
  local prog="$1" eff="$2" other rel
  shift 2
  local -a args=("$@")
  local n=0
  while [ "$n" -lt "${#args[@]}" ]; do
    case "${args[n]}" in
      -C | --dir | --prefix) eff="$(kit_resolve_dir "$eff" "${args[n + 1]:-}")"; n=$((n + 1)) ;;
      --dir=*) eff="$(kit_resolve_dir "$eff" "${args[n]#--dir=}")" ;;
      --prefix=*) eff="$(kit_resolve_dir "$eff" "${args[n]#--prefix=}")" ;;
    esac
    n=$((n + 1))
  done
  [ -n "$eff" ] || block "$prog after a cd whose target cannot be read from a literal path (fail closed)" "$RULE_CD"
  other="$(pm_for "$eff")"
  if [ -n "$other" ] && [ "$other" != "$prog" ]; then
    rel="$(kit_rel_to_root "$eff")"
    block "$prog in a directory the manifest maps to $other ($rel: ${words[*]})" "$(rule_for "$other" "$rel")"
  fi
}

on_command() {
  local dir="$1" prog sub
  shift
  words=("$@")
  prog="${1##*/}"
  shift
  case "$prog" in
    pnpm)
      ensure_manifest
      check_pm pnpm "$dir" "$@" ;;
    npm)
      sub="${1:-}"
      case "$sub" in
        install | i | add | ci | update | up | uninstall | remove | rm | un | run | run-script)
          ensure_manifest
          check_pm npm "$dir" "$@" ;;
      esac ;;
  esac
  return 0
}

declare -a words=()
kit_walk_commands "$cmd" on_command
exit 0
