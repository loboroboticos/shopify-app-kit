#!/usr/bin/env bash
# shopify-app-kit v0.7.0
# hooks/doctor.sh: SessionStart briefing for a consumer repo. Validates .claude/shopify-app.json structurally
# (required keys, enums, patterns of schema v1), prints one paragraph of facts to stdout, and reports vendored-hook
# drift. Never exits non-zero. Silent when the repo has no manifest (it is not a consumer).
# Registered by the plugin's hooks/hooks.json; not vendored.
set -uo pipefail

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

kit_read_input
cwd="$PWD"
if kit_has_jq; then
  c="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null || true)"
  [ -n "$c" ] && cwd="$c"
fi
kit_resolve_manifest "$cwd"
[ -f "$manifest" ] || exit 0

if ! kit_has_jq; then
  echo "shopify-app-kit doctor (v$KIT_VERSION): jq is not installed, so $manifest cannot be validated and the guard hooks will fail closed. Install jq."
  exit 0
fi

if ! jq -e . "$manifest" >/dev/null 2>&1; then
  echo "shopify-app-kit doctor (v$KIT_VERSION): $manifest is not valid JSON. Guard hooks will fail closed until it is repaired."
  exit 0
fi

problems="$(jq -r '
  def policies: ["config-required", "operator-only", "allowed"];
  def prob(c; m): if c then [] else [m] end;
  def isstr: type == "string";
  def isobj: type == "object";
  def strarr: type == "array" and all(.[]; type == "string");
  def known: ["$schema","$comment","kit","app","shopifyCli","branches","packageManagers","paths","apiVersion","webhooks","scopes","deploy","billing","database","checks","auth","docs"];
  prob(isobj; "manifest must be a JSON object")
  + prob(.kit.schemaVersion == 1; "kit.schemaVersion must be 1")
  + prob((.kit.version == null) or (.kit.version | isstr); "kit.version must be a string or null")
  + prob(.app.name | isstr; "app.name must be a string")
  + prob(.shopifyCli | isobj; "shopifyCli must be an object")
  + prob((.shopifyCli.devPolicy // "") as $p | policies | index($p) != null; "shopifyCli.devPolicy must be one of config-required | operator-only | allowed")
  + prob((.shopifyCli.deployPolicy // "") as $p | policies | index($p) != null; "shopifyCli.deployPolicy must be one of config-required | operator-only | allowed")
  + prob((.shopifyCli.configUsePolicy // "") as $p | policies | index($p) != null; "shopifyCli.configUsePolicy must be one of config-required | operator-only | allowed")
  + prob((.shopifyCli.themeDevFromRoot // "") as $p | ["block","allow"] | index($p) != null; "shopifyCli.themeDevFromRoot must be block | allow")
  + prob((.shopifyCli.devPolicy != "config-required") or (.shopifyCli.configs.dev | isstr); "shopifyCli.configs.dev is required when devPolicy is config-required")
  + prob((.shopifyCli.deployPolicy != "config-required") or (.shopifyCli.configs.deploy | isstr); "shopifyCli.configs.deploy is required when deployPolicy is config-required")
  + prob(.branches.default | isstr; "branches.default must be a string")
  + prob((.branches.protected | strarr) and (.branches.protected | length > 0); "branches.protected must be a non-empty array of strings")
  + prob((.branches.promotion == null) or ((.branches.promotion | isobj) and (.branches.promotion.from | isstr) and (.branches.promotion.to | isstr)); "branches.promotion must be null or {from, to}")
  + prob((.packageManagers | isobj) and all(.packageManagers[]; . == "npm" or . == "pnpm"); "packageManagers must map directories to npm | pnpm")
  + prob((.apiVersion == null) or (.apiVersion.expected | isstr and test("^20[0-9][0-9]-(01|04|07|10)$")); "apiVersion.expected must look like 2026-07")
  + prob((.database == null) or (.database.provider | isstr); "database.provider must be a string")
  + ((keys - known) | map("unknown top-level key: " + .))
  | .[]
' "$manifest" 2>&1)"

rel="$manifest"
case "$manifest" in "$root"/*) rel="${manifest#"$root"/}" ;; esac

if [ -n "$problems" ]; then
  echo "shopify-app-kit doctor (v$KIT_VERSION): $rel does not satisfy schema v1. Guard hooks read it anyway, so fix these before relying on them:"
  printf '%s\n' "$problems" | sed 's/^/  - /'
else
  kv="$(mf '.kit.version // "null"')"
  echo "shopify-app-kit doctor (v$KIT_VERSION): $rel OK (schema v1, kit.version $kv)."
fi

mf '
  def s: if . == null then "-" else tostring end;
  def pm: (.packageManagers // {}) | to_entries | map("\(.key)=\(.value)") | join(" ");
  def cfgs: (.shopifyCli.configs // {}) | to_entries | map("\(.key)=\(.value)") | join(" ");
  def promo: if .branches.promotion == null then "none" else "\(.branches.promotion.from) -> \(.branches.promotion.to)" end;
  "\(.app.name | s) (\(.app.kind | s)). Default branch \(.branches.default | s); protected: \((.branches.protected // []) | join(", ")); promotion \(promo). "
  + "Shopify CLI configs: \(if cfgs == "" then "none" else cfgs end). "
  + "Policies: app dev \(.shopifyCli.devPolicy | s), app deploy \(.shopifyCli.deployPolicy | s), config use \(.shopifyCli.configUsePolicy | s), theme dev from root \(.shopifyCli.themeDevFromRoot | s). "
  + "Package managers: \(if pm == "" then "none" else pm end). "
  + "API version \(.apiVersion.expected | s). "
  + (if .auth.expiringOfflineTokens == null then "" else "Expiring offline tokens: \(if .auth.expiringOfflineTokens then "yes" else "no" end). " end)
  + (if .billing.method == null then "" else "Billing method: \(.billing.method). " end)
  + "Guard hooks read this manifest and fail closed when it is missing."
'

# Vendored-hook drift: each .claude/hooks/kit/*.sh header should match kit.version.
kv="$(mf '.kit.version // empty')"
hookdir="$root/.claude/hooks/kit"
if [ -d "$hookdir" ]; then
  for f in "$hookdir"/*.sh; do
    [ -f "$f" ] || continue
    hv="$(sed -n '2s/^# shopify-app-kit v//p' "$f")"
    if [ -z "$hv" ]; then
      echo "Drift: $(basename "$f") has no '# shopify-app-kit vX.Y.Z' header; re-run /shopify-app-kit:sync."
    elif [ -n "$kv" ] && [ "$hv" != "$kv" ]; then
      echo "Drift: $(basename "$f") is v$hv but the manifest's kit.version is $kv; re-run /shopify-app-kit:sync."
    fi
  done
  if [ -f "$root/.claude/settings.json" ] && ! grep -q 'hooks/kit/guard-' "$root/.claude/settings.json" 2>/dev/null; then
    echo "Drift: .claude/settings.json does not register .claude/hooks/kit/guard-*.sh under PreToolUse; the vendored guards will not fire. /shopify-app-kit:sync prints the snippet."
  fi
elif [ -n "$kv" ]; then
  echo "Drift: the manifest says kit.version $kv but $root/.claude/hooks/kit/ does not exist; run /shopify-app-kit:sync."
fi
exit 0
