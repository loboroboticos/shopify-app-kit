#!/usr/bin/env bash
# shopify-app-kit v0.17.7
# hooks/guard-protected-branch.sh: PreToolUse(Bash and GitHub MCP) guard that keeps a session off the protected branches named in
# .claude/shopify-app.json (branches.protected, branches.default, branches.promotion, deploy.protectedWorkflows).
#
#   git push                    blocked when the destination is protected: an explicit refspec (main, :main,
#                               x:refs/heads/main, +main), --all / --mirror / --branches, a wildcard or non-literal
#                               destination, an implicit / HEAD / @ push from a checkout (honouring git -C) whose current
#                               branch is protected, a push the repo's config sends to one (remote.<r>.push, push.default
#                               upstream / matching), or a git -c that redirects a push or aliases one
#   gh pr merge                 blocked when the PR's base is protected (resolved with gh pr view; unresolvable = blocked)
#   gh pr edit --base X         blocked when X is protected (--base X, --base=X, -B X, -BX)
#   gh api                      blocked for pulls/<n>/merge into a protected base, base=<protected> on /merges or a PR,
#                               writes to git/refs/heads/<protected>, ref= or branch= <protected> writes, a protected
#                               workflow's dispatch or a rerun / cancel of its runs, a GraphQL merge or auto-merge, a
#                               mutation naming a protected branch, and a GraphQL query read from a file
#   gh workflow run, gh run     blocked for deploy.protectedWorkflows (file name, .github/workflows/<file>, display name,
#   rerun / cancel              numeric id) and for a rerun / cancel of one of their runs; an id gh cannot resolve = blocked
#   GitHub MCP tools            the same rules for mcp__*github*__ tools on any repo (a second PreToolUse matcher,
#                               mcp__.*github.*): push_files / create_or_update_file / delete_file / create_branch to a
#                               protected branch, update_pull_request base, merge_pull_request / enable_pr_auto_merge
#                               into a protected base, actions_run_trigger run_workflow of a protected workflow and
#                               rerun / cancel of its runs. A PR base, numeric workflow id or run's workflow is resolved
#                               with gh; unresolvable = blocked. Every other MCP tool passes.
#
# Allowed on purpose: gh pr create --base <protected> (a promotion PR), pushes to the default or a feature branch,
# git status/commit/log, gh api reads, gh workflow run of any other workflow. Anything the guard cannot read
# (no jq, no manifest, an unresolvable PR base, a cd to a non-literal path before an implicit push) fails closed.
# Vendored into consumers at .claude/hooks/kit/guard-protected-branch.sh by /shopify-app-kit:sync.
set -uo pipefail

KIT_HOOK_NAME=guard-protected-branch
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
kit_fail_closed_on_exit

kit_read_input

# A GitHub MCP tool this guard checks sets mcp_verb; any other MCP tool is not this guard's business. With jq the
# name is .tool_name itself, so a "tool_name" key inside tool_input cannot stand in for it; server names match in
# any letter case.
if kit_has_jq; then raw_tool="$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null || true)"; else raw_tool="$(kit_raw_tool)"; fi
mcp_verb=""
shopt -s nocasematch
case "$raw_tool" in
  mcp__*github*__*)
    mcp_verb="${raw_tool##*__}"
    case "$mcp_verb" in
      push_files | create_or_update_file | delete_file | create_branch | update_pull_request | merge_pull_request | enable_pr_auto_merge | actions_run_trigger) ;;
      *) exit 0 ;;
    esac ;;
  mcp__*) exit 0 ;;
esac
shopt -u nocasematch

if ! kit_has_jq; then
  [ -z "$mcp_verb" ] || kit_require_jq "a GitHub MCP $mcp_verb cannot be checked against the manifest's protected branches"
  shopt -s nocasematch
  case "$input" in *'"tool_name"'*'"mcp__'*github*__*) shopt -u nocasematch; kit_require_jq "a GitHub MCP call cannot be told apart from its arguments" ;; esac
  shopt -u nocasematch
  # Without jq the protected names cannot be read, so every guarded verb fails closed, whatever it names and however
  # the command is spelled: the program and its verb as words, in order (kit_raw_words).
  case "$(kit_raw_words)" in
    *" git "*" push "* | *" gh "*" pr "*" merge "* | *" gh "*" pr "*" edit "* | *" gh "*" api "* | *" gh "*" workflow "*" run "* | *mergePullRequest*)
      kit_require_jq "a push, merge, base change, API write or workflow run cannot be checked against the manifest's protected branches" ;;
  esac
  exit 0
fi

kit_parse_input
[ -n "$mcp_verb" ] || case "$cmd_bare" in *git* | *gh*) ;; *) exit 0 ;; esac

kit_require_manifest "$cwd"
jq -e '(.branches.protected | type == "array") and (.branches.protected | length) > 0' "$manifest" >/dev/null 2>&1 \
  || block "the repo manifest is missing or unreadable ($manifest): branches.protected must be a non-empty array, so the command cannot be checked (fail closed)" "$KIT_MANIFEST_RULE"

# Line by line, not mapfile: bash 3.2 (macOS's /bin/bash) has no mapfile.
PROTECTED=(); while IFS= read -r l; do PROTECTED+=("$l"); done < <(mf '.branches.protected[]')
WORKFLOWS=(); while IFS= read -r l; do WORKFLOWS+=("$l"); done < <(mf '.deploy.protectedWorkflows[]?')
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
  for f in ${WORKFLOWS[@]+"${WORKFLOWS[@]}"}; do
    [ "$1" = "$f" ] && return 0
    [ "$1" = ".github/workflows/$f" ] && return 0
    [ "$1" = "$(workflow_display_name "$f")" ] && return 0
  done
  return 1
}

# on_protected DIR: is the checkout at DIR on a protected branch?
on_protected() { is_protected "$(git -C "$1" symbolic-ref --quiet --short HEAD 2>/dev/null)"; }

# pr_base [SELECTOR] [-R REPO]: the PR's base branch as gh resolves it from the command's cwd, or nothing.
pr_base() { local b; b="$( (cd "$cwd" 2>/dev/null && gh pr view "$@" --json baseRefName --jq .baseRefName 2>/dev/null) )" || b=""; printf '%s' "$b"; }

# check_git_push DIR ARGS...: DIR is the checkout the push runs from ("" when it cannot be read literally).
check_git_push() {
  local dir="$1" n=0 spec dst
  shift
  local -a args=("$@") positional=()
  while [ "$n" -lt "${#args[@]}" ]; do
    case "${args[n]}" in
      --all | --mirror | --branches) block "git push ${args[n]} pushes $protected_list along with every other branch" "$RULE" ;;
      -o | --push-option | --repo | --receive-pack | --exec) n=$((n + 1)) ;;
      -*) ;;
      *) positional+=("${args[n]}") ;;
    esac
    n=$((n + 1))
  done
  if [ "${#positional[@]}" -le 1 ]; then
    [ -n "$dir" ] || block "git push with no refspec after a cd whose target cannot be read from a literal path (fail closed)" "$RULE_CD"
    if on_protected "$dir"; then block "git push with no refspec from a checkout on a protected branch" "$RULE"; fi
    check_configured_push "$dir" "${positional[0]:-}" ""
    return 0
  fi
  for spec in "${positional[@]:1}"; do
    spec="${spec#+}"
    dst="${spec##*:}"
    case "$spec" in *'$'* | *'`'*) block "git push $spec names a destination that is not a literal branch (fail closed)" "$RULE" ;; esac
    case "$dst" in *'*'*) block "git push $spec is a wildcard refspec, which can reach $protected_list" "$RULE" ;; esac
    case "$spec" in *:*) ;; *) [ -z "$dir" ] || check_configured_push "$dir" "${positional[0]}" "$spec" ;; esac
    case "$dst" in
      HEAD | @)
        [ -n "$dir" ] || block "git push $spec after a cd whose target cannot be read from a literal path (fail closed)" "$RULE_CD"
        if on_protected "$dir"; then block "git push $spec from a checkout on a protected branch" "$RULE"; fi ;;
      *) if is_protected "$dst"; then block "git push to a protected branch ($spec)" "$RULE"; fi ;;
    esac
  done
}

# check_configured_push DIR REMOTE SRC: a push that names no destination goes where the repository's config sends it
# (remote.<remote>.push refspecs; push.default upstream/tracking sends SRC, or the current branch, to its upstream;
# matching sends every local branch the remote has). Block when that can be a protected branch.
check_configured_push() {
  local dir="$1" remote="$2" src="${3:-}" rs d pd p
  [ -n "$src" ] || src="$(git -C "$dir" symbolic-ref --quiet --short HEAD 2>/dev/null)"
  [ -n "$remote" ] || remote="$(git -C "$dir" config "branch.$src.remote" 2>/dev/null)"
  while IFS= read -r rs; do
    [ -n "$rs" ] || continue
    d="${rs##*:}"; d="${d#+}"
    case "$d" in *'*'*) block "git push to $remote follows its configured push refspec $rs, which can reach $protected_list" "$RULE" ;; esac
    if is_protected "$d"; then block "git push to $remote follows its configured push refspec $rs into ${d#refs/heads/}" "$RULE"; fi
  done < <(git -C "$dir" config --get-all "remote.${remote:-origin}.push" 2>/dev/null)
  pd="$(git -C "$dir" config push.default 2>/dev/null)"
  case "$pd" in
    upstream | tracking)
      d="$(git -C "$dir" config "branch.$src.merge" 2>/dev/null)"
      if is_protected "$d"; then block "git push of $src goes to its upstream ${d#refs/heads/} (push.default=$pd)" "$RULE"; fi ;;
    matching)
      for p in "${PROTECTED[@]}"; do
        if git -C "$dir" show-ref --verify --quiet "refs/heads/$p"; then block "git push with push.default=matching pushes the local $p" "$RULE"; fi
      done ;;
  esac
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
  local n=0 b
  local -a args=("$@")
  while [ "$n" -lt "${#args[@]}" ]; do
    case "${args[n]}" in
      -B | --base) if is_protected "${args[n + 1]:-}"; then block "gh pr edit --base ${args[n + 1]} retargets a PR at a protected branch" "$RULE"; fi ;;
      --base=*) if is_protected "${args[n]#--base=}"; then block "gh pr edit ${args[n]} retargets a PR at a protected branch" "$RULE"; fi ;;
      -B?*) b="${args[n]#-B}"; if is_protected "${b#=}"; then block "gh pr edit ${args[n]} retargets a PR at a protected branch" "$RULE"; fi ;;
    esac
    n=$((n + 1))
  done
}

# Quotes are stripped when words are split, so a multi-word display name arrives as several positionals:
# try the first positional alone and all positionals joined.
check_gh_workflow_run() {
  local n=0 repo=""
  local -a args=("$@") positional=()
  while [ "$n" -lt "${#args[@]}" ]; do
    case "${args[n]}" in
      -R | --repo) repo="${args[n + 1]:-}"; n=$((n + 1)) ;;
      --repo=*) repo="${args[n]#--repo=}" ;;
      -r | --ref | -f | --raw-field | -F | --field) n=$((n + 1)) ;;
      -*) ;;
      *) positional+=("${args[n]}") ;;
    esac
    n=$((n + 1))
  done
  case "${positional[0]:-}" in
    *[!0-9]* | "") ;;
    *) check_workflow_ref "${positional[0]}" "$repo" "gh workflow run"; return 0 ;;
  esac
  if is_protected_workflow "${positional[0]:-}" || is_protected_workflow "${positional[*]:-}"; then
    block "gh workflow run of a production deploy (${positional[*]:-})" "$RULE"
  fi
}

# gh run rerun|cancel [RUN]: resolve the run's workflow; a job id alone cannot be resolved, so it fails closed.
check_gh_run() {
  local verb="$1" n=0 repo="" run="" job=""
  shift
  local -a args=("$@")
  while [ "$n" -lt "${#args[@]}" ]; do
    case "${args[n]}" in
      -R | --repo) repo="${args[n + 1]:-}"; n=$((n + 1)) ;;
      --repo=*) repo="${args[n]#--repo=}" ;;
      -j | --job) job="${args[n + 1]:-}"; n=$((n + 1)) ;;
      -*) ;;
      *) [ -n "$run" ] || run="${args[n]}" ;;
    esac
    n=$((n + 1))
  done
  if [ -n "$run" ]; then check_run_ref "$run" "$repo" "gh run $verb"
  elif [ -n "$job" ]; then block "gh run $verb --job $job: its workflow cannot be resolved from a job id (fail closed); name the run id" "$RULE"
  fi
}

check_gh_api() {
  local joined=" $* " base n p api_repo
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
  local re_dispatch='actions/workflows/([^/[:space:]]+)/dispatches' re_run='actions/runs/([0-9]+)/(rerun|rerun-failed-jobs|cancel|force-cancel)'
  local re_pull='pulls/[0-9]+([[:space:]?]|$)' re_contents='/contents/' write=0
  shopt -s nocasematch; [[ "$joined" =~ $re_write ]] && write=1; shopt -u nocasematch
  if [[ "$joined" =~ $re_repo ]]; then api_repo="${BASH_REMATCH[1]}"; else api_repo=""; fi
  if [[ "$joined" =~ $re_dispatch ]]; then check_workflow_ref "${BASH_REMATCH[1]}" "$api_repo" "gh api workflow dispatch"; fi
  if [[ "$joined" =~ $re_run ]]; then check_run_ref "${BASH_REMATCH[1]}" "$api_repo" "gh api ${BASH_REMATCH[2]}"; fi
  for p in "${PROTECTED[@]}"; do
    if [[ "$joined" == *[[:space:]=]base=$p[[:space:]]* ]]; then
      [[ "$joined" =~ $re_merges ]] && block "gh api /merges into $p" "$RULE"
      [[ "$joined" =~ $re_pull ]] && block "gh api retargets a PR at a protected branch ($p)" "$RULE"
    fi
    if [ "$write" -eq 1 ]; then
      [[ "$joined" == *"git/refs/heads/$p"* ]] && block "gh api write to git/refs/heads/$p" "$RULE"
      [[ "$joined" == *[[:space:]=]ref=refs/heads/$p[[:space:]]* ]] && block "gh api creates or moves refs/heads/$p" "$RULE"
      if [[ "$joined" == *"$re_contents"* ]] && [[ "$joined" == *[[:space:]=]branch=$p[[:space:]]* ]]; then block "gh api writes a file to $p" "$RULE"; fi
    fi
  done
  if [ "$write" -eq 1 ] && [[ "$joined" == *"$re_contents"* ]] && [[ "$joined" != *[[:space:]=]branch=* ]] && is_protected "$default_branch"; then
    block "gh api writes a file with no branch, so to the default branch $default_branch" "$RULE"
  fi
  for p in mergePullRequest enablePullRequestAutoMerge; do
    [[ "$joined" == *"$p"* ]] && block "gh api graphql $p cannot be checked for its base branch (fail closed); use gh pr merge" "$RULE"
  done
  if [[ "$joined" == *" graphql "* ]]; then
    case "$joined" in *query=@* | *" --input "*) block "gh api graphql with the query in a file cannot be checked (fail closed)" "$RULE" ;; esac
    # the branch as a whole name: the query is one word now, and "domain" names no branch
    for p in "${PROTECTED[@]}"; do
      case "$joined" in
        *updatePullRequest*baseRefName*[!A-Za-z0-9._-]"$p"[!A-Za-z0-9._/-]* | *createCommitOnBranch*[!A-Za-z0-9._-]"$p"[!A-Za-z0-9._/-]* \
          | *updateRef*[!A-Za-z0-9._-]"$p"[!A-Za-z0-9._/-]*) block "gh api graphql mutation names a protected branch ($p)" "$RULE" ;;
      esac
    done
  fi
}

on_command() {
  local dir="$1" prog i=0 c
  shift
  local -a w=("$@") rest=() cfg=()
  prog="${w[0]##*/}"
  i=1
  case "$prog" in
    git)
      while [ "$i" -lt "${#w[@]}" ]; do
        case "${w[i]}" in
          -C) dir="$(kit_resolve_dir "$dir" "${w[i + 1]:-}")"; i=$((i + 2)) ;;
          -c | --config-env) cfg+=("${w[i + 1]:-}"); i=$((i + 2)) ;;
          --git-dir | --work-tree | --namespace) i=$((i + 2)) ;;
          -*) i=$((i + 1)) ;;
          *) break ;;
        esac
      done
      for c in ${cfg[@]+"${cfg[@]}"}; do
        shopt -s nocasematch
        case "$c" in
          push.* | remote.*.push=* | remote.*.push) shopt -u nocasematch; [ "${w[i]:-}" = push ] && block "git -c $c changes where a push goes (fail closed)" "$RULE" ;;
          alias.*=*push*) shopt -u nocasematch; block "git -c $c defines an alias that pushes (fail closed)" "$RULE" ;;
        esac
        shopt -u nocasematch
      done
      if [ "${w[i]:-}" = push ]; then check_git_push "$dir" "${w[@]:i+1}"; fi ;;
    gh)
      rest=("${w[@]:i+2}")
      case "${w[i]:-} ${w[i + 1]:-}" in
        "pr merge") check_gh_pr_merge ${rest[@]+"${rest[@]}"} ;;
        "pr edit") check_gh_pr_edit ${rest[@]+"${rest[@]}"} ;;
        "workflow run") check_gh_workflow_run ${rest[@]+"${rest[@]}"} ;;
        "run rerun") check_gh_run rerun ${rest[@]+"${rest[@]}"} ;;
        "run cancel") check_gh_run cancel ${rest[@]+"${rest[@]}"} ;;
        "api "*) check_gh_api "${w[@]:i+1}" ;;
      esac ;;
  esac
  return 0
}

# gh_path ENDPOINT: the .path of a gh api read (a workflow, or a run's workflow) as a file name, or nothing. A failed
# call (an expired token, a 404, a rate limit) prints its JSON error body and exits non-zero: that is nothing, never
# a path. A dynamic workflow (dynamic/...) keeps its path, which no protected entry matches.
gh_path() {
  local p; p="$( (cd "$cwd" 2>/dev/null && gh api "$1" --jq .path 2>/dev/null) )" || p=""
  p="${p%%@*}"
  case "$p" in .github/workflows/?* | dynamic/?*) printf '%s' "${p##*/}" ;; esac
}

# repo_api [REPO]: the repos/<owner>/<repo> prefix for gh api, from -R REPO or the checkout's own repository.
repo_api() { if [ -n "${1:-}" ]; then printf 'repos/%s' "$1"; else printf 'repos/{owner}/{repo}'; fi; }

# check_workflow_ref WF [REPO] WHAT: block WHAT when WF (a file name, path, display name or numeric id) is protected;
# a numeric id gh cannot map to a file fails closed.
check_workflow_ref() {
  local wf="$1" repo="$2" what="$3"
  case "$wf" in
    "" | *[!0-9]*) ;;
    *) wf="$(gh_path "$(repo_api "$repo")/actions/workflows/$1")"
       [ -n "$wf" ] || block "$what of workflow id $1: gh could not map it to a file (fail closed)" "$RULE" ;;
  esac
  if is_protected_workflow "$wf"; then block "$what of a production deploy ($wf)" "$RULE"; fi
}

# check_run_ref RUN [REPO] WHAT: block WHAT on a run of a protected workflow; a run gh cannot resolve fails closed.
check_run_ref() {
  local wf
  wf="$(gh_path "$(repo_api "$2")/actions/runs/$1")"
  [ -n "$wf" ] || block "$3 of run $1: its workflow could not be resolved with gh (fail closed)" "$RULE"
  if is_protected_workflow "$wf"; then block "$3 of a production deploy run ($wf)" "$RULE"; fi
}

check_mcp() {
  local slug n base="" wf="" run method
  slug="$(kit_tool_arg owner)/$(kit_tool_arg repo)"
  case "$mcp_verb" in
    push_files | create_or_update_file | delete_file | create_branch)
      n="$(kit_tool_arg branch)"
      [ -n "$n" ] || block "$mcp_verb names no branch, so it cannot be checked (fail closed)" "$RULE"
      if is_protected "$n"; then block "$mcp_verb writes to a protected branch ($n)" "$RULE"; fi ;;
    update_pull_request)
      base="$(kit_tool_arg base)"
      if is_protected "$base"; then block "update_pull_request retargets PR #$(kit_tool_arg pullNumber) at a protected branch ($base)" "$RULE"; fi ;;
    merge_pull_request | enable_pr_auto_merge)
      n="$(kit_tool_arg pullNumber)"
      [ -z "$n" ] || base="$(pr_base "$n" -R "$slug")"
      [ -n "$base" ] || block "$mcp_verb of PR #${n:-?}: its base branch could not be resolved with gh, so the merge is refused (fail closed)" "$RULE"
      if is_protected "$base"; then block "$mcp_verb of PR #$n merges into $base" "$RULE"; fi ;;
    actions_run_trigger)
      method="$(kit_tool_arg method)"
      case "$method" in
        run_workflow)
          wf="$(kit_tool_arg workflow_id)"
          [ -n "$wf" ] || block "actions_run_trigger run_workflow names no workflow, so it cannot be checked (fail closed)" "$RULE"
          check_workflow_ref "$wf" "$slug" "actions_run_trigger run_workflow" ;;
        rerun_workflow_run | rerun_failed_jobs | cancel_workflow_run)
          run="$(kit_tool_arg run_id)"
          [ -n "$run" ] || block "actions_run_trigger $method names no run, so it cannot be checked (fail closed)" "$RULE"
          check_run_ref "$run" "$slug" "actions_run_trigger $method" ;;
      esac ;;
  esac
}

if [ -n "$mcp_verb" ]; then check_mcp; exit 0; fi
kit_walk_commands "$cmd" on_command
exit 0
