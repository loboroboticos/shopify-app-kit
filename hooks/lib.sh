#!/usr/bin/env bash
# shopify-app-kit v0.13.0
# hooks/lib.sh: shared helpers for the shopify-app-kit guard hooks. Sourced, never executed.
# Vendored into consumers at .claude/hooks/kit/lib.sh by /shopify-app-kit:sync, next to the guards.
#
# Contract for a guard that sources this file:
#   KIT_HOOK_NAME=guard-something; . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
#   kit_read_input            -> $input (raw hook JSON from stdin)
#   kit_parse_input           -> $cmd (tool_input.command), $cwd (absolute)   [needs jq]
#   kit_resolve_manifest DIR  -> $manifest, $root (the CONSUMER repo root)
#   kit_manifest_ok           -> 0 when the manifest is readable and kit.schemaVersion == 1
#   mf JQ_FILTER              -> jq -r over the manifest
#   block REASON RULE         -> standard block message on stderr, exit 2
#   kit_require_jq WHAT       -> block when jq is missing ("jq is not installed, so WHAT (fail closed)")
#   kit_require_manifest [DIR]-> resolve the manifest and block when it is missing or unreadable
#   kit_ensure_manifest       -> the lazy form: 0 the first time (read your keys now), 1 once loaded
#   kit_walk_commands CMD CB  -> calls CB "<effective dir>" <prog> <args...> for every simple command in CMD,
#                                after heredoc stripping, control-operator splitting and cd/pushd/popd tracking.

KIT_VERSION="0.13.0"
KIT_HOOK_NAME="${KIT_HOOK_NAME:-hook}"
KIT_MANIFEST_RULE="Add or repair .claude/shopify-app.json (the repo manifest the kit's guard hooks read; schema: shopify-app-kit schemas/shopify-app.v1.schema.json)."

manifest=""
root=""
input=""
cmd=""
cwd=""

# ---------------------------------------------------------------- blocking

block() {
  printf 'Blocked by shopify-app-kit/%s: %s.\n%s\nCases: shopify-app-kit test/hooks.test.mjs (v%s).\n' \
    "$KIT_HOOK_NAME" "$1" "$2" "$KIT_VERSION" >&2
  exit 2
}

# ---------------------------------------------------------------- hook input

kit_read_input() { input="$(cat 2>/dev/null || true)"; }

kit_has_jq() { command -v jq >/dev/null 2>&1; }

kit_parse_input() {
  cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null || true)"
  cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null || true)"
  [ -n "$cwd" ] || cwd="$PWD"
  case "$cwd" in /*) ;; *) cwd="$PWD/$cwd" ;; esac
}

# ---------------------------------------------------------------- manifest resolution

# kit_find_manifest_upward DIR: print the nearest DIR/.claude/shopify-app.json walking up, or nothing.
kit_find_manifest_upward() {
  local d="$1"
  [ -n "$d" ] || return 1
  while :; do
    if [ -f "$d/.claude/shopify-app.json" ]; then printf '%s' "$d/.claude/shopify-app.json"; return 0; fi
    case "$d" in / | "" | .) return 1 ;; esac
    d="$(dirname "$d")"
  done
}

# kit_resolve_manifest [START_DIR]: set $manifest and $root.
#   $SHOPIFY_APP_KIT_MANIFEST wins (tests, unusual layouts), then $CLAUDE_PROJECT_DIR/.claude/shopify-app.json,
#   then a walk up from START_DIR (default: $PWD). The consumer root is the manifest's grandparent when the manifest
#   sits at <repo>/.claude/shopify-app.json, else $SHOPIFY_APP_KIT_ROOT / $CLAUDE_PROJECT_DIR / the manifest's directory.
kit_resolve_manifest() {
  local start="${1:-$PWD}" found
  if [ -n "${SHOPIFY_APP_KIT_MANIFEST:-}" ]; then
    manifest="$SHOPIFY_APP_KIT_MANIFEST"
  elif [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    manifest="$CLAUDE_PROJECT_DIR/.claude/shopify-app.json"
  else
    found="$(kit_find_manifest_upward "$start" || true)"
    manifest="${found:-$start/.claude/shopify-app.json}"
  fi
  case "$manifest" in /*) ;; *) manifest="$PWD/$manifest" ;; esac
  if [ -n "${SHOPIFY_APP_KIT_ROOT:-}" ]; then
    root="$SHOPIFY_APP_KIT_ROOT"
  else
    case "$manifest" in
      */.claude/shopify-app.json) root="${manifest%/.claude/shopify-app.json}" ;;
      *) root="${CLAUDE_PROJECT_DIR:-$(dirname "$manifest")}" ;;
    esac
  fi
  [ -n "$root" ] || root="/"
  if [ -d "$root" ]; then root="$(cd "$root" 2>/dev/null && pwd -P)"; else root="$(kit_norm_path "$root")"; fi
}

kit_manifest_ok() {
  [ -r "$manifest" ] && jq -e '.kit.schemaVersion == 1' "$manifest" >/dev/null 2>&1
}

mf() { jq -r "$1" "$manifest"; }

# ---------------------------------------------------------------- fail-closed prologue

KIT_JQ_RULE="Install jq (brew install jq / apt-get install jq)."
manifest_loaded=0

# kit_require_jq WHAT: block when jq is missing, naming what could not be inspected without it.
kit_require_jq() { kit_has_jq || block "jq is not installed, so $1 (fail closed)" "$KIT_JQ_RULE"; }

# kit_require_manifest [START_DIR]: resolve the manifest and block when it is missing or unreadable.
kit_require_manifest() {
  kit_resolve_manifest "${1:-$cwd}"
  kit_manifest_ok || block "the repo manifest is missing or unreadable ($manifest), so the command cannot be checked (fail closed)" "$KIT_MANIFEST_RULE"
}

# kit_ensure_manifest: for a guard that reads the manifest only once a guarded form is seen (so a command that
# merely mentions its tool in prose never needs one). Returns 0 the first time, when the caller reads its keys,
# and 1 on every later call.
kit_ensure_manifest() {
  [ "$manifest_loaded" -eq 1 ] && return 1
  kit_require_manifest "$cwd"
  manifest_loaded=1
}

# ---------------------------------------------------------------- paths

# kit_norm_path PATH: lexically normalise an absolute-ish path (collapses ., .., //).
kit_norm_path() {
  local IFS=/ part
  local -a out=()
  set -f
  for part in $1; do
    case "$part" in
      "" | .) ;;
      ..) [ "${#out[@]}" -eq 0 ] || unset "out[$((${#out[@]} - 1))]" ;;
      *) out+=("$part") ;;
    esac
  done
  set +f
  if [ "${#out[@]}" -eq 0 ]; then printf '/'; else printf '/%s' "${out[@]}"; fi
}

# kit_rel_to_root PATH: print "." for the consumer root, "sub/dir" for a path under it, nothing otherwise.
kit_rel_to_root() {
  local p phys cand
  [ -n "$1" ] || return 0
  p="$(kit_norm_path "$1")"
  if [ -d "$1" ]; then phys="$(cd "$1" 2>/dev/null && pwd -P)"; else phys="$p"; fi
  for cand in "$p" "$phys"; do
    if [ "$cand" = "$root" ]; then printf '.'; return 0; fi
    case "$cand" in "$root"/*) printf '%s' "${cand#"$root"/}"; return 0 ;; esac
  done
}

kit_is_root() { [ "$(kit_rel_to_root "$1")" = "." ]; }

# kit_resolve_dir BASE TARGET: the directory a `cd TARGET` lands in from BASE, or "" when TARGET is not a literal path.
kit_resolve_dir() {
  local base="$1" target="$2"
  case "$target" in
    "" | "~") printf '%s' "${HOME:-}" ;;
    "~/"*) printf '%s' "${HOME:-}/${target#\~/}" ;;
    -* | *'$'* | *'*'* | *'?'* | *'['*) printf '' ;;
    /*) kit_norm_path "$target" ;;
    *) [ -n "$base" ] && kit_norm_path "$base/$target" ;;
  esac
}

# ---------------------------------------------------------------- command splitting

# kit_strip_heredocs CMD: heredoc bodies are prose; print CMD without them (the opening line stays).
kit_strip_heredocs() {
  local line delim="" stripped=""
  while IFS= read -r line; do
    if [ -n "$delim" ]; then
      [ "${line#"${line%%[!$'\t']*}"}" = "$delim" ] && delim=""
      continue
    fi
    stripped+="$line"$'\n'
    if [[ "$line" =~ \<\<-?[[:space:]]*[\'\"]?([A-Za-z_][A-Za-z0-9_]*) ]]; then delim="${BASH_REMATCH[1]}"; fi
  done <<<"$1"
  printf '%s' "$stripped"
}

# kit_split_segments CMD: one simple command per line; ( and $( become __PUSH__, ) becomes __POP__, so a cd inside a
# subshell does not leak. Backticks are NOT a boundary (they are far more often prose in commit messages).
kit_split_segments() {
  local s="$1" nl=$'\n'
  s="${s//\$\(/${nl}__PUSH__${nl}}"
  s="${s//\(/${nl}__PUSH__${nl}}"
  s="${s//\)/${nl}__POP__${nl}}"
  s="${s//&&/${nl}}"
  s="${s//||/${nl}}"
  s="${s//;/${nl}}"
  s="${s//|/${nl}}"
  s="${s//&/${nl}}"
  printf '%s' "$s"
}

kit__stack_pop() {
  if [ "${#kit_stack[@]}" -gt 0 ]; then
    dir="${kit_stack[$((${#kit_stack[@]} - 1))]}"
    unset "kit_stack[$((${#kit_stack[@]} - 1))]"
    return 0
  fi
  return 1
}

# kit_walk_commands CMD CALLBACK: for every simple command in CMD, call CALLBACK "<effective dir>" <words...>,
# where words start at the program (wrappers like env/npx/VAR=x are skipped, quotes are removed).
# The effective dir starts at $cwd and follows literal cd/pushd/popd; it is "" after a cd whose target is not literal.
kit_walk_commands() {
  local command_text="$1" cb="$2" stripped segments seg i prog
  local -a w
  kit_stack=()
  dir="$cwd"
  stripped="$(kit_strip_heredocs "$command_text")"
  segments="$(kit_split_segments "$stripped")"
  while IFS= read -r seg; do
    case "$seg" in
      __PUSH__) kit_stack+=("$dir"); continue ;;
      __POP__) kit__stack_pop || true; continue ;;
    esac
    read -ra w <<<"$seg" || true
    [ "${#w[@]}" -gt 0 ] || continue
    for i in "${!w[@]}"; do w[i]="${w[i]//[\"\']/}"; done
    i=0
    while [ "$i" -lt "${#w[@]}" ]; do
      case "${w[i]}" in
        *=* | env | command | exec | time | nohup | sudo) i=$((i + 1)) ;;
        npx | pnpx | bunx | corepack)
          i=$((i + 1))
          while [ "$i" -lt "${#w[@]}" ] && [[ "${w[i]}" == -* ]]; do i=$((i + 1)); done ;;
        *) break ;;
      esac
    done
    [ "$i" -lt "${#w[@]}" ] || continue
    prog="${w[i]##*/}"
    case "$prog" in
      cd | pushd) dir="$(kit_resolve_dir "$dir" "${w[$((i + 1))]:-}")"; continue ;;
      popd) kit__stack_pop || dir=""; continue ;;
    esac
    "$cb" "$dir" "${w[@]:i}"
  done <<<"$segments"
}
