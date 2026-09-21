#!/usr/bin/env bash
# shopify-app-kit v0.9.0
# hooks/guard-protected-branch.sh: PreToolUse(Bash) guard that keeps a session off the protected branches named in
# .claude/shopify-app.json (branches.protected, branches.default, branches.promotion, deploy.protectedWorkflows).
#
#   git push                    blocked when the destination is protected: an explicit refspec (main, :main,
#                               x:refs/heads/main, +main), --all / --mirror, or an implicit / HEAD / @ push from a
#                               checkout (honouring git -C) whose current branch is protected
#   gh pr merge                 blocked when the PR's base is protected (resolved with gh pr view; unresolvable = blocked)
#   gh pr edit --base X         blocked when X is protected
#   gh api                      blocked for pulls/<n>/merge into a protected base, /merges with base=<protected>,
#                               writes to git/refs/heads/<protected>, and any mergePullRequest GraphQL mutation
#   gh workflow run             blocked for deploy.protectedWorkflows (file name, .github/workflows/<file>, display name)
#
# Allowed on purpose: gh pr create --base <protected> (a promotion PR), pushes to the default or a feature branch,
# git status/commit/log, gh api reads, gh workflow run of any other workflow. Anything the guard cannot read
# (no jq, no manifest, an unresolvable PR base, a cd to a non-literal path before an implicit push) fails closed.
# Vendored into consumers at .claude/hooks/kit/guard-protected-branch.sh by /shopify-app-kit:sync.
set -uo pipefail

KIT_HOOK_NAME=guard-protected-branch
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

kit_read_input

if ! kit_has_jq; then
  case "$input" in
    *" main"* | *":main"* | *heads/main* | *deploy.yml* | *mergePullRequest*)
      block "jq is not installed, so a command that mentions main or a deploy cannot be inspected (fail closed)" "Install jq (brew install jq / apt-get install jq)." ;;
  esac
  exit 0
fi

kit_parse_input
case "$cmd" in *git* | *gh*) ;; *) exit 0 ;; esac

kit_resolve_manifest "$cwd"
kit_manifest_ok && jq -e '(.branches.protected | type == "array") and (.branches.protected | length) > 0' "$manifest" >/dev/null 2>&1 \
  || block "the repo manifest is missing or unreadable ($manifest), so the command cannot be checked (fail closed)" "$KIT_MANIFEST_RULE"

mapfile -t PROTECTED < <(mf '.branches.protected[]')
mapfile -t WORKFLOWS < <(mf '.deploy.protectedWorkflows[]?')
default_branch="$(mf '.branches.default // empty')"
promotion="$(mf 'if .branches.promotion then "\(.branches.promotion.from) -> \(.branches.promotion.to)" else empty end')"
protected_list="$(IFS=,; printf '%s' "${PROTECTED[*]}")"
protected_list="${protected_list//,/, }"

RULE="Only the maintainer ships to $protected_list. Target ${default_branch:-the default branch} instead; Claude may open a ${promotion:-${default_branch:-default} -> ${PROTECTED[0]}} promotion PR when asked, never merge it."
RULE_CD="The push would go wherever that checkout is; cd to a literal path first, or name the branch (git push origin <branch>). $RULE"

is_protected() {
  local b="${1#refs/heads/}" p
  for p in "${PROTECTED[@]}"; do [ "$b" = "$p" ] && return 0; done
  return 1
}

# workflow_display_name FILE: the `name:` of <consumer root>/.github/workflows/FILE, or nothing.
workflow_display_name() {
  sed -nE "s/^name:[[:space:]]*[\"']?([^\"']*)[\"']?[[:space:]]*\$/\\1/p" "$root/.github/workflows/$1" 2>/dev/null | head -n1
}

is_protected_workflow() {
  local f
  [ -n "$1" ] || return 1
  for f in "${WORKFLOWS[@]}"; do
    [ "$1" = "$f" ] && return 0
    [ "$1" = ".github/workflows/$f" ] && return 0
    [ "$1" = "$(workflow_display_name "$f")" ] && return 0
  done
  return 1
}

# on_protected DIR: is the checkout at DIR on a protected branch?
on_protected() { is_protected "$(git -C "$1" symbolic-ref --quiet --short HEAD 2>/dev/null)"; }

# pr_base [SELECTOR] [-R REPO]: the PR's base branch as gh resolves it from the command's cwd, or nothing.
pr_base() { (cd "$cwd" 2>/dev/null && gh pr view "$@" --json baseRefName --jq .baseRefName 2>/dev/null); }

# check_git_push DIR ARGS...: DIR is the checkout the push runs from ("" when it cannot be read literally).
check_git_push() {
  local dir="$1" n=0 spec dst
  shift
  local -a args=("$@") positional=()
  while [ "$n" -lt "${#args[@]}" ]; do
    case "${args[n]}" in
      --all | --mirror) block "git push ${args[n]} pushes $protected_list along with every other branch" "$RULE" ;;
      -o | --push-option | --repo | --receive-pack | --exec) n=$((n + 1)) ;;
      -*) ;;
      *) positional+=("${args[n]}") ;;
    esac
    n=$((n + 1))
  done
  if [ "${#positional[@]}" -le 1 ]; then
    [ -n "$dir" ] || block "git push with no refspec after a cd whose target cannot be read from a literal path (fail closed)" "$RULE_CD"
    if on_protected "$dir"; then block "git push with no refspec from a checkout on a protected branch" "$RULE"; fi
    return 0
  fi
  for spec in "${positional[@]:1}"; do
    spec="${spec#+}"
    dst="${spec##*:}"
    case "$dst" in
      HEAD | @)
        [ -n "$dir" ] || block "git push $spec after a cd whose target cannot be read from a literal path (fail closed)" "$RULE_CD"
        if on_protected "$dir"; then block "git push $spec from a checkout on a protected branch" "$RULE"; fi ;;
      *) if is_protected "$dst"; then block "git push to a protected branch ($spec)" "$RULE"; fi ;;
    esac
  done
}

check_gh_pr_merge() {
  local n=0 base
  local -a args=("$@") sel=() repo=()
  while [ "$n" -lt "${#args[@]}" ]; do
    case "${args[n]}" in
      -R | --repo) repo=(-R "${args[n + 1]:-}"); n=$((n + 1)) ;;
      --repo=*) repo=(-R "${args[n]#--repo=}") ;;
      -t | --subject | -b | --body | -F | --body-file | -A | --author-email | --match-head-commit) n=$((n + 1)) ;;
      -*) ;;
      *) [ "${#sel[@]}" -eq 0 ] && sel=("${args[n]}") ;;
    esac
    n=$((n + 1))
  done
  base="$(pr_base ${sel[@]+"${sel[@]}"} ${repo[@]+"${repo[@]}"})"
  [ -n "$base" ] || block "gh pr merge ${sel[*]:-(current branch)}: its base branch could not be resolved, so the merge is refused (fail closed)" "$RULE"
  if is_protected "$base"; then block "gh pr merge ${sel[*]:-(current branch)} merges into $base" "$RULE"; fi
}

check_gh_pr_edit() {
  local n=0
  local -a args=("$@")
  while [ "$n" -lt "${#args[@]}" ]; do
    case "${args[n]}" in
      -B | --base) if is_protected "${args[n + 1]:-}"; then block "gh pr edit --base ${args[n + 1]} retargets a PR at a protected branch" "$RULE"; fi ;;
      --base=*) if is_protected "${args[n]#--base=}"; then block "gh pr edit ${args[n]} retargets a PR at a protected branch" "$RULE"; fi ;;
    esac
    n=$((n + 1))
  done
}

# Quotes are stripped when words are split, so a multi-word display name arrives as several positionals:
# try the first positional alone and all positionals joined.
check_gh_workflow_run() {
  local n=0
  local -a args=("$@") positional=()
  while [ "$n" -lt "${#args[@]}" ]; do
    case "${args[n]}" in
      -r | --ref | -f | --raw-field | -F | --field | -R | --repo) n=$((n + 1)) ;;
      -*) ;;
      *) positional+=("${args[n]}") ;;
    esac
    n=$((n + 1))
  done
  if is_protected_workflow "${positional[0]:-}" || is_protected_workflow "${positional[*]:-}"; then
    block "gh workflow run of a production deploy (${positional[*]:-})" "$RULE"
  fi
}

check_gh_api() {
  local joined=" $* " base n p
  local -a repo=()
  local re_merge='pulls/([0-9]+)/merge([[:space:]?]|$)'
  local re_repo='repos/([^/{}[:space:]]+/[^/{}[:space:]]+)/pulls'
  local re_merges='/merges[[:space:]]'
  local re_write='[[:space:]](-X|--method)[[:space:]=]*(PATCH|POST|PUT|DELETE)|[[:space:]](-f|-F|--field|--raw-field|--input)[[:space:]]'
  if [[ "$joined" =~ $re_merge ]]; then
    n="${BASH_REMATCH[1]}"
    if [[ "$joined" =~ $re_repo ]]; then repo=(-R "${BASH_REMATCH[1]}"); fi
    base="$(pr_base "$n" ${repo[@]+"${repo[@]}"})"
    [ -n "$base" ] || block "gh api merge of PR #$n: its base branch could not be resolved (fail closed)" "$RULE"
    if is_protected "$base"; then block "gh api merge of PR #$n into $base" "$RULE"; fi
  fi
  if [[ "$joined" =~ $re_merges ]]; then
    for p in "${PROTECTED[@]}"; do [[ "$joined" == *" base=$p "* ]] && block "gh api /merges into $p" "$RULE"; done
  fi
  if [[ "$joined" == *mergePullRequest* ]]; then
    block "gh api graphql mergePullRequest cannot be checked for its base branch (fail closed); use gh pr merge" "$RULE"
  fi
  for p in "${PROTECTED[@]}"; do
    if [[ "$joined" == *"git/refs/heads/$p"* ]]; then
      shopt -s nocasematch
      if [[ "$joined" =~ $re_write ]]; then shopt -u nocasematch; block "gh api write to git/refs/heads/$p" "$RULE"; fi
      shopt -u nocasematch
    fi
  done
}

on_command() {
  local dir="$1" prog i=0
  shift
  local -a w=("$@") rest=()
  prog="${w[0]##*/}"
  i=1
  case "$prog" in
    git)
      while [ "$i" -lt "${#w[@]}" ]; do
        case "${w[i]}" in
          -C) dir="$(kit_resolve_dir "$dir" "${w[i + 1]:-}")"; i=$((i + 2)) ;;
          -c | --git-dir | --work-tree | --namespace) i=$((i + 2)) ;;
          -*) i=$((i + 1)) ;;
          *) break ;;
        esac
      done
      if [ "${w[i]:-}" = push ]; then check_git_push "$dir" "${w[@]:i+1}"; fi ;;
    gh)
      rest=("${w[@]:i+2}")
      case "${w[i]:-} ${w[i + 1]:-}" in
        "pr merge") check_gh_pr_merge ${rest[@]+"${rest[@]}"} ;;
        "pr edit") check_gh_pr_edit ${rest[@]+"${rest[@]}"} ;;
        "workflow run") check_gh_workflow_run ${rest[@]+"${rest[@]}"} ;;
        "api "*) check_gh_api "${w[@]:i+1}" ;;
      esac ;;
  esac
  return 0
}

kit_walk_commands "$cmd" on_command
exit 0
