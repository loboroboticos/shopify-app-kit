#!/usr/bin/env bash
# shopify-app-kit v0.17.6
# hooks/lib.sh: shared helpers for the shopify-app-kit guard hooks. Sourced, never executed.
# Vendored into consumers at .claude/hooks/kit/lib.sh by /shopify-app-kit:sync, next to the guards.
#
# Contract for a guard that sources this file:
#   KIT_HOOK_NAME=guard-something; . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
#   kit_read_input            -> $input (raw hook JSON from stdin)
#   kit_parse_input           -> $cmd (tool_input.command), $tool (tool_name), $cwd (absolute)   [needs jq]
#   kit_tool_arg KEY          -> tool_input.KEY as text, or nothing (an MCP tool's argument)   [needs jq]
#   kit_raw_tool              -> tool_name without jq, or nothing
#   kit_raw_command           -> tool_input.command without jq, JSON-escaped (the whole payload when it has none)
#   kit_raw_words             -> kit_raw_command as words two spaces apart, for a no-jq pre-filter (over-matches)
#   kit_resolve_manifest DIR  -> $manifest, $root (the CONSUMER repo root)
#   kit_manifest_ok           -> 0 when the manifest is readable and kit.schemaVersion == 1
#   mf JQ_FILTER              -> jq -r over the manifest
#   block REASON RULE         -> standard block message on stderr, exit 2
#   kit_require_jq WHAT       -> block when jq is missing ("jq is not installed, so WHAT (fail closed)")
#   kit_require_manifest [DIR]-> resolve the manifest and block when it is missing or unreadable
#   kit_ensure_manifest       -> the lazy form: 0 the first time (read your keys now), 1 once loaded
#   kit_fail_closed_on_exit   -> a guard's net: any exit other than 0 or 2 (the guard itself failed) becomes a block
#   kit_walk_commands CMD CB  -> calls CB "<effective dir>" <prog> <args...> for every simple command in CMD,
#                                after heredoc stripping, control-operator splitting and cd/pushd/popd tracking.

KIT_VERSION="0.17.6"
KIT_HOOK_NAME="${KIT_HOOK_NAME:-hook}"
KIT_MANIFEST_RULE="Add or repair .claude/shopify-app.json (the repo manifest the kit's guard hooks read; schema: shopify-app-kit schemas/shopify-app.v1.schema.json)."

manifest=""
root=""
input=""
cmd=""
tool=""
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
  tool="$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null || true)"
  cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null || true)"
  [ -n "$cwd" ] || cwd="$PWD"
  case "$cwd" in /*) ;; *) cwd="$PWD/$cwd" ;; esac
}

kit_tool_arg() { jq -r --arg k "$1" '.tool_input[$k] // empty | tostring' <<<"$input" 2>/dev/null || true; }

kit_raw_tool() { printf '%s' "$input" | sed -E -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"([^"\\]*)".*/\1/p'; }

# kit_raw_command: tool_input.command without jq, JSON-escaped as it sits in the payload (a substring test on it is
# as good as one on the parsed command); the whole payload when no command key is found, so an unknown shape still
# fails closed on the guards' words rather than open. The no-jq pre-filters match this, never $input, whose cwd
# would otherwise decide (#38).
kit_raw_command() {
  local c; c="$(printf '%s' "$input" | sed -E -n 's/.*"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p')"
  printf '%s' "${c:-$input}"
}

# kit_raw_words: kit_raw_command as words two spaces apart (JSON escapes, quotes, slashes and shell operators split
# them), so *" git "*" push "* matches `git -C . push`, `git<TAB>push`, `/usr/bin/git push` and `x;git push` alike.
# Over-matches on purpose (no jq: refuse a mention, never miss a command); LC_ALL=C keeps BSD sed off non-UTF-8 bytes.
kit_raw_words() {
  local w; w="$(kit_raw_command | tr '\n' ' ' | LC_ALL=C sed -E 's/\\[tnr"]/ /g; s/[^A-Za-z0-9._:@+=-]+/ /g; s/ /  /g')"
  [ -n "$w" ] || { w="$(kit_raw_command)"; w="${w// /  }"; }
  printf '  %s  ' "$w"
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
KIT_GUARD_RULE="The error above is the guard's, not the command's: check bash, jq, sed and git on PATH, then re-run /shopify-app-kit:sync."
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

# kit_fail_closed_on_exit: every guard calls it right after sourcing this file. Claude Code blocks only on exit 2, so
# a guard that dies on its own (a builtin an old bash lacks, an unbound variable under set -u) would let the command
# run; this turns every exit other than 0 (allow) and 2 (block) into a block. doctor.sh never calls it: it exits 0.
kit_fail_closed_on_exit() {
  trap 'kit__rc=$?; [ "$kit__rc" -eq 0 ] || [ "$kit__rc" -eq 2 ] || block "the guard itself failed (exit $kit__rc), so the command is refused (fail closed)" "$KIT_GUARD_RULE"' EXIT
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

# kit_strip_heredocs CMD: heredoc bodies are prose; print CMD without them (the opening line stays). A here-string
# (<<<) and a << inside quotes open nothing, and the body of a heredoc fed to a shell (bash <<EOF, ... | sh) is a
# script, so it stays.
kit_strip_heredocs() {
  local line delim="" stripped="" pre dq sq d
  local re="(^|[^<])<<-?[[:space:]]*[\"']?([A-Za-z_][A-Za-z0-9_]*)" shell_re='(^|[[:space:];|&(])(bash|sh|zsh|dash|ksh)([[:space:]]|$)'
  while IFS= read -r line; do
    if [ -n "$delim" ]; then
      [ "${line#"${line%%[!$'\t']*}"}" = "$delim" ] && delim=""
      continue
    fi
    stripped+="$line"$'\n'
    if [[ "$line" =~ $re ]]; then
      d="${BASH_REMATCH[2]}"; pre="${line%%"${BASH_REMATCH[0]}"*}"; dq="${pre//[!\"]/}"; sq="${pre//[!\']/}"
      if [ $(( ${#dq} % 2 + ${#sq} % 2 )) -eq 0 ] && ! [[ "$line" =~ $shell_re ]]; then delim="$d"; fi
    fi
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

# kit__wrap_value WRAPPER OPTION: does OPTION of the wrapper command take the next word as its value?
kit__wrap_value() {
  case "$1 $2" in
    "sudo -u" | "sudo -g" | "sudo -C" | "sudo -D" | "sudo -h" | "sudo -p" | "sudo -r" | "sudo -t" | "sudo -U" | "sudo -T" \
      | "sudo --user" | "sudo --group" | "sudo --chdir" | "doas -u" | "doas -C" | "env -u" | "env --unset" | "env -C" \
      | "env --chdir" | "nice -n" | "nice --adjustment" | "timeout -s" | "timeout -k" | "timeout --signal" \
      | "timeout --kill-after" | "xargs -I" | "xargs -n" | "xargs -P" | "xargs -L" | "xargs -s" | "xargs -d" | "xargs -E" \
      | "xargs -a" | "exec -a" | "stdbuf -i" | "stdbuf -o" | "stdbuf -e" | "ionice -c" | "ionice -n" | "ionice -p") return 0 ;;
  esac
  return 1
}

# kit_pm_parse PM ARGS...: for an npm/pnpm/yarn/bun command, skip its global options (and their values) and set
# kit_pm_sub (the subcommand), kit_pm_rest (the words after it) and kit_inner (the command it runs, when it runs one:
# exec/x/dlx X, run|run-script shopify|prisma, or pnpm/yarn/bun shopify|prisma; empty otherwise).
kit_pm_parse() {
  local pm="${1##*/}" i=1 j=0
  local -a w=("$@")
  kit_pm_sub=""; kit_pm_rest=(); kit_inner=()
  while [ "$i" -lt "${#w[@]}" ]; do
    case "${w[i]}" in
      -*=*) i=$((i + 1)) ;;
      --prefix | --workspace | --registry | --cache | --userconfig | --globalconfig | --loglevel | --dir | --filter \
        | --workspace-concurrency | --reporter | --cwd | -C | -F) i=$((i + 2)) ;;
      -w) if [ "$pm" = npm ]; then i=$((i + 2)); else i=$((i + 1)); fi ;;
      -*) i=$((i + 1)) ;;
      *) break ;;
    esac
  done
  [ "$i" -lt "${#w[@]}" ] || return 0
  kit_pm_sub="${w[i]}"
  [ $((i + 1)) -ge "${#w[@]}" ] || kit_pm_rest=("${w[@]:i+1}")
  case "$kit_pm_sub" in
    exec | x | dlx)
      while [ "$j" -lt "${#kit_pm_rest[@]}" ]; do
        case "${kit_pm_rest[j]}" in
          -p | --package | -c | --call) j=$((j + 2)) ;;
          -*) j=$((j + 1)) ;;
          *) break ;;
        esac
      done
      [ "$j" -ge "${#kit_pm_rest[@]}" ] || kit_inner=("${kit_pm_rest[@]:j}") ;;
    run | run-script)
      case "${kit_pm_rest[0]:-}" in
        shopify | prisma)
          kit_inner=("${kit_pm_rest[0]}")
          for j in "${!kit_pm_rest[@]}"; do [ "$j" -eq 0 ] || [ "${kit_pm_rest[j]}" = -- ] || kit_inner+=("${kit_pm_rest[j]}"); done ;;
      esac ;;
    shopify | prisma) [ "$pm" = npm ] || kit_inner=("$kit_pm_sub" ${kit_pm_rest[@]+"${kit_pm_rest[@]}"}) ;;
  esac
  return 0
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
# where words start at the program (wrappers like env/sudo/timeout/xargs/eval/npx/VAR=x, their options, and a shell's
# -c are skipped; quotes are removed; a backslash-newline joins two lines). The effective dir starts at $cwd and
# follows literal cd/pushd/popd; it is "" after a cd whose target is not literal.
kit_walk_commands() {
  local command_text="$1" cb="$2" stripped segments seg i j c prog wrap bsnl=$'\\\n'
  local -a w
  kit_stack=()
  dir="$cwd"
  stripped="$(kit_strip_heredocs "$command_text")"
  stripped="${stripped//"$bsnl"/ }"
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
      wrap="${w[i]##*/}"
      [[ "${w[i]}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && wrap="VAR="
      case "$wrap" in
        VAR=) i=$((i + 1)) ;;
        env | command | exec | time | nohup | sudo | doas | nice | timeout | xargs | eval | stdbuf | ionice | setsid)
          i=$((i + 1))
          while [ "$i" -lt "${#w[@]}" ]; do
            case "${w[i]}" in
              --) i=$((i + 1)); break ;;
              -*) if kit__wrap_value "$wrap" "${w[i]}"; then i=$((i + 2)); else i=$((i + 1)); fi ;;
              *=*) if [ "$wrap" = env ]; then i=$((i + 1)); else break; fi ;;
              *) break ;;
            esac
          done
          if [ "$wrap" = timeout ] && [ "$i" -lt "${#w[@]}" ]; then i=$((i + 1)); fi ;;
        bash | sh | zsh | dash | ksh)
          j=$((i + 1)); c=0
          while [ "$j" -lt "${#w[@]}" ] && [[ "${w[j]}" == -* ]]; do
            [[ "${w[j]}" == --* ]] || [[ "${w[j]}" != *c* ]] || c=1
            j=$((j + 1))
          done
          [ "$c" -eq 1 ] || break
          i=$j ;;
        npx | pnpx | bunx | corepack)
          i=$((i + 1))
          while [ "$i" -lt "${#w[@]}" ] && [[ "${w[i]}" == -* ]]; do
            case "${w[i]}" in -p | --package | -c | --call) i=$((i + 2)) ;; *) i=$((i + 1)) ;; esac
          done ;;
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
