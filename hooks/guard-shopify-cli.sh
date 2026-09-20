#!/usr/bin/env bash
# shopify-app-kit v0.3.0
# hooks/guard-shopify-cli.sh: PreToolUse(Bash) guard for Shopify CLI commands, driven by .claude/shopify-app.json.
#
#   shopify app dev [clean]     per shopifyCli.devPolicy      (config-required: --config must equal configs.dev)
#   shopify app deploy          per shopifyCli.deployPolicy   (config-required: --config must equal configs.deploy)
#   shopify app config use X    per shopifyCli.configUsePolicy (config-required: X must be a manifest config)
#   <pm> run deploy             blocked unless deployPolicy is allowed (it expands to a bare shopify app deploy)
#   shopify theme dev           blocked from the repo root when shopifyCli.themeDevFromRoot is "block"
#
# operator-only blocks outright: ask the maintainer to run it from their terminal. Anything the guard cannot read
# (no jq, no manifest, a cd to a non-literal path before theme dev) fails closed.
# Vendored into consumers at .claude/hooks/kit/guard-shopify-cli.sh by /shopify-app-kit:sync.
set -uo pipefail

KIT_HOOK_NAME=guard-shopify-cli
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

kit_read_input

if ! kit_has_jq; then
  case "$input" in
    *shopify* | *deploy*) block "jq is not installed, so a shopify/deploy command cannot be inspected (fail closed)" "Install jq (brew install jq / apt-get install jq)." ;;
  esac
  exit 0
fi

kit_parse_input
case "$cmd" in *shopify* | *deploy*) ;; *) exit 0 ;; esac

kit_resolve_manifest "$cwd"
kit_manifest_ok || block "the repo manifest is missing or unreadable ($manifest), so the command cannot be checked (fail closed)" "$KIT_MANIFEST_RULE"

cfg_dev="$(mf '.shopifyCli.configs.dev // empty')"
cfg_deploy="$(mf '.shopifyCli.configs.deploy // empty')"
require_config="$(mf '.shopifyCli.requireConfigFlag // false')"
legacy_default=allowed
[ "$require_config" = true ] && legacy_default=config-required
dev_policy="$(mf ".shopifyCli.devPolicy // \"$legacy_default\"")"
deploy_policy="$(mf ".shopifyCli.deployPolicy // \"$legacy_default\"")"
config_use_policy="$(mf '.shopifyCli.configUsePolicy // "allowed"')"
theme_policy="$(mf '.shopifyCli.themeDevFromRoot // "allow"')"

RULE_CONFIG="Pass --config: ${cfg_dev:-<dev>} for app dev / app dev clean, ${cfg_deploy:-<deploy>} for app deploy (per .claude/shopify-app.json shopifyCli.configs). The CLI's default config may point at the wrong app registration."
RULE_OPERATOR="Ask the maintainer to run it from their terminal (per .claude/shopify-app.json shopifyCli policies)."
RULE_CONFIG_USE="shopify app config use rewrites the CLI's default config for this checkout. Use --config on each command instead, or ask the maintainer (per .claude/shopify-app.json shopifyCli.configUsePolicy)."
RULE_THEME="shopify theme pull into a scratch directory and run theme dev from there; this repo has no theme files and theme dev syncs the local directory onto the remote theme (per .claude/shopify-app.json shopifyCli.themeDevFromRoot)."

# check_config_policy WHAT POLICY EXPECTED_CONFIG ARGS...: enforce a config-required/operator-only/allowed policy
# on `shopify app WHAT ARGS...`.
check_config_policy() {
  local what="$1" policy="$2" expected="$3" has=0 val=""
  shift 3
  case "$policy" in
    allowed) return 0 ;;
    operator-only) block "shopify app $what is operator-only in this repo" "$RULE_OPERATOR" ;;
    config-required)
      while [ $# -gt 0 ]; do
        case "$1" in
          --config | -c) has=1; val="${2:-}"; [ $# -gt 1 ] && shift ;;
          --config=*) has=1; val="${1#--config=}" ;;
          -c=*) has=1; val="${1#-c=}" ;;
        esac
        shift
      done
      [ "$has" -eq 1 ] || block "shopify app $what without --config" "$RULE_CONFIG"
      if [ -n "$expected" ] && [ "$val" != "$expected" ]; then
        block "shopify app $what --config ${val:-<empty>} names the wrong config (the manifest expects $expected)" "$RULE_CONFIG"
      fi ;;
    *) block "shopifyCli policy for app $what is '$policy', which the guard does not understand (fail closed)" "$KIT_MANIFEST_RULE" ;;
  esac
}

check_config_use() {
  local name="${1:-}"
  case "$config_use_policy" in
    allowed) return 0 ;;
    operator-only) block "shopify app config use is operator-only in this repo" "$RULE_CONFIG_USE" ;;
    config-required)
      [ -n "$name" ] || block "shopify app config use without a config name" "$RULE_CONFIG_USE"
      if [ "$name" != "$cfg_dev" ] && [ "$name" != "$cfg_deploy" ]; then
        block "shopify app config use $name names a config the manifest does not list (dev=${cfg_dev:-<none>}, deploy=${cfg_deploy:-<none>})" "$RULE_CONFIG_USE"
      fi ;;
    *) block "shopifyCli.configUsePolicy is '$config_use_policy', which the guard does not understand (fail closed)" "$KIT_MANIFEST_RULE" ;;
  esac
}

# check_theme_dev DIR ARGS...: block theme dev whose effective directory is the consumer root (or unknown).
check_theme_dev() {
  local eff="$1"
  shift
  [ "$theme_policy" = block ] || return 0
  while [ $# -gt 0 ]; do
    case "$1" in
      --path) eff="$(kit_resolve_dir "$dir" "${2:-}")"; [ $# -gt 1 ] && shift ;;
      --path=*) eff="$(kit_resolve_dir "$dir" "${1#--path=}")" ;;
    esac
    shift
  done
  [ -n "$eff" ] || block "shopify theme dev after a cd whose target cannot be read from a literal path (fail closed)" "$RULE_THEME"
  if kit_is_root "$eff"; then block "shopify theme dev from the repo root (${words[*]})" "$RULE_THEME"; fi
}

check_pm_deploy() {
  local pm="$1"
  case "$deploy_policy" in
    allowed) return 0 ;;
    operator-only) block "$pm run deploy expands to shopify app deploy, which is operator-only in this repo" "$RULE_OPERATOR" ;;
    config-required) block "$pm run deploy expands to a bare shopify app deploy (no --config)" "$RULE_CONFIG" ;;
    *) block "shopifyCli.deployPolicy is '$deploy_policy', which the guard does not understand (fail closed)" "$KIT_MANIFEST_RULE" ;;
  esac
}

on_command() {
  local dir="$1" prog sub
  shift
  words=("$@")
  prog="${1##*/}"
  shift
  case "$prog" in
    npm | pnpm | yarn | bun)
      sub="${1:-}"
      case "$sub" in run | run-script) sub="${2:-}" ;; esac
      [ "$sub" = deploy ] && check_pm_deploy "$prog" ;;
    shopify)
      case "${1:-} ${2:-}" in
        "app dev") shift 2; check_config_policy dev "$dev_policy" "$cfg_dev" "$@" ;;
        "app deploy") shift 2; check_config_policy deploy "$deploy_policy" "$cfg_deploy" "$@" ;;
        "app config") [ "${3:-}" = use ] && check_config_use "${4:-}" ;;
        "theme dev") shift 2; check_theme_dev "$dir" "$@" ;;
      esac ;;
  esac
  return 0
}

declare -a words=()
kit_walk_commands "$cmd" on_command
exit 0
