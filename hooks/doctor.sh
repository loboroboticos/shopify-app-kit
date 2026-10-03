#!/usr/bin/env bash
# shopify-app-kit v0.17.3
# hooks/doctor.sh: SessionStart briefing for a consumer repo. Validates .claude/shopify-app.json structurally
# (required keys, enums, patterns of schema v1), prints one paragraph of facts to stdout, reports vendored-hook
# drift and a kit.routines entry that is not a consumer routine this kit ships, checks the two companions (the
# Shopify plugin and the graphify skill), and, when gh is on PATH, prints the last successful run of every
# scheduled workflow. Never exits non-zero. Silent when the repo has no manifest (it is not a consumer).
# Registered by the plugin's hooks/hooks.json; not vendored.
set -uo pipefail

# The graphify release the templates' kit-bootstrap.sh installs; both pins are compared by test/templates.test.mjs.
GRAPHIFY_VERSION="0.9.65"

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

# The known top-level keys and the kit.* patterns come from the schema next to this hook, never from a second copy
# here: the doctor follows a schema change in the same commit. Without the schema those checks are skipped.
schema="$(dirname "${BASH_SOURCE[0]}")/../schemas/shopify-app.v1.schema.json"
rules="$(jq -c '.properties as $p | {keys: ($p | keys), portfolioId: $p.kit.properties.portfolioId.pattern, routine: $p.kit.properties.routines.items.pattern}' "$schema" 2>/dev/null || echo null)"

problems="$(jq -r --argjson rules "$rules" '
  def policies: ["config-required", "operator-only", "allowed"];
  def prob(c; m): if c then [] else [m] end;
  def isstr: type == "string";
  def isobj: type == "object";
  def strarr: type == "array" and all(.[]; type == "string");
  prob(isobj; "manifest must be a JSON object")
  + prob(.kit.schemaVersion == 1; "kit.schemaVersion must be 1")
  + prob((.kit.version == null) or (.kit.version | isstr); "kit.version must be a string or null")
  + prob((.kit.portfolioId == null) or (.kit.portfolioId | isstr and ($rules.portfolioId == null or test($rules.portfolioId))); "kit.portfolioId must match \($rules.portfolioId // "its schema pattern") (an opaque id, never a name)")
  + prob((.kit.routines == null) or (.kit.routines | strarr and ($rules.routine == null or all(.[]; test($rules.routine)))); "kit.routines must be an array of strings matching \($rules.routine // "its schema pattern") (routine file names without .md)")
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
  + (if $rules.keys == null then [] else ((keys - $rules.keys) | map("unknown top-level key: " + .)) end)
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
  + (((.kit | objects) // {}) as $k | if $k.portfolioId == null then "" else "Portfolio: \($k.portfolioId); routines: \((($k.routines // []) | if type == "array" then map(tostring) | join(", ") else "" end) as $r | if $r == "" then "none" else $r end). " end)
  + "Guard hooks read this manifest and fail closed when it is missing."
'

# Vendored-hook drift: each .claude/hooks/kit/*.sh header should match kit.version; a vendored guard the kit no
# longer ships is stale, and one the kit marks `# Deprecated:` (line 3 of the plugin's copy) is leaving.
kv="$(mf '((.kit | objects) // {}).version // empty')"
hookdir="$root/.claude/hooks/kit"
plugin_hooks="$(dirname "${BASH_SOURCE[0]}")"
if [ -d "$hookdir" ]; then
  for f in "$hookdir"/*.sh; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    hv="$(sed -n '2s/^# shopify-app-kit v//p' "$f")"
    if [ -z "$hv" ]; then
      echo "Drift: $name has no '# shopify-app-kit vX.Y.Z' header; re-run /shopify-app-kit:sync."
    elif [ -n "$kv" ] && [ "$hv" != "$kv" ]; then
      echo "Drift: $name is v$hv but the manifest's kit.version is $kv; re-run /shopify-app-kit:sync."
    fi
    case "$name" in
      guard-*.sh)
        if [ ! -f "$plugin_hooks/$name" ]; then
          echo "Drift: $name is vendored but the kit no longer ships it; delete it and its .claude/settings.json entry (kit-dev: Remove a skill, agent, hook, workflow or routine)."
        else
          dep="$(sed -n '3s/^# Deprecated: //p' "$plugin_hooks/$name")"
          [ -n "$dep" ] && echo "Deprecated: $name: $dep It leaves the kit in the next minor; remove it from .claude/settings.json and .claude/hooks/kit/ now."
        fi ;;
    esac
  done
  if [ -f "$root/.claude/settings.json" ] && ! grep -q 'hooks/kit/guard-' "$root/.claude/settings.json" 2>/dev/null; then
    echo "Drift: .claude/settings.json does not register .claude/hooks/kit/guard-*.sh under PreToolUse; the vendored guards will not fire. /shopify-app-kit:sync prints the snippet."
  elif [ -f "$root/.claude/hooks/kit/guard-protected-branch.sh" ] && ! grep -q '"mcp__\.\*github' "$root/.claude/settings.json" 2>/dev/null; then
    echo "Drift: .claude/settings.json does not register guard-protected-branch.sh for the GitHub MCP tools (matcher mcp__.*github.*), so an MCP push, merge or workflow run is unguarded. /shopify-app-kit:sync prints the snippet."
  fi
elif [ -n "$kv" ]; then
  echo "Drift: the manifest says kit.version $kv but $root/.claude/hooks/kit/ does not exist; run /shopify-app-kit:sync."
fi

# kit.routines names the routines this product runs (the registry's maintainer step makes one per entry). An entry
# with no routines/<name>.md of that exact name next to this hook is a typo, a removed routine or one a newer kit
# adds; one whose file says "not a consumer" runs in the kit repository. Skipped when routines/ is not next to it.
routines_dir="$(dirname "${BASH_SOURCE[0]}")/../routines"
if [ -d "$routines_dir" ]; then
  mf '(((.kit | objects) // {}).routines // []) | if type == "array" then .[] | tostring else empty end' | while IFS= read -r r; do
    rf=""; for g in "$routines_dir"/*.md; do [ "${g##*/}" = "$r.md" ] && rf="$g"; done
    if [ -z "$rf" ]; then echo "Drift: kit.routines names \`$r\`, which this kit version does not ship; remove it or update the kit."
    elif grep -q 'not a consumer' "$rf"; then echo "Drift: kit.routines names \`$r\`, which runs in the kit repository and is nobody's roster entry; remove it."
    fi
  done
fi

# Companion plugins. Shopify: the admin-api, dev-loop and release skills use shopify-ai-toolkit (docs and schema search,
# CLI reference, the App Store review check) when it is installed. One warning when `claude plugin list` runs
# and does not list it; one info line while its telemetry opt-out file is absent. Silent when the claude binary
# is absent (a plain shell, CI); never blocks.
if command -v claude >/dev/null 2>&1; then
  plugins="$(claude plugin list 2>/dev/null || true)"
  if [ -n "$plugins" ] && ! grep -q 'shopify-ai-toolkit' <<<"$plugins"; then
    echo "Companion: shopify-ai-toolkit is not installed; run: claude plugin install shopify-ai-toolkit@claude-plugins-official (the admin-api, dev-loop and release skills use it when present)."
  fi
  if [ ! -f "${HOME:-/nonexistent}/.config/shopify-ai-toolkit/opt-out" ]; then
    echo "Companion: shopify-ai-toolkit telemetry is on (no ~/.config/shopify-ai-toolkit/opt-out); to opt out: mkdir -p ~/.config/shopify-ai-toolkit && touch ~/.config/shopify-ai-toolkit/opt-out."
  fi
  # graphify is a pip package plus a user-level skill (never a plugin): present when the CLI is on PATH or the
  # skill file exists in the Claude config dir or in the repo. The graphify-refresh routine skips without it.
  if ! command -v graphify >/dev/null 2>&1 \
    && [ ! -f "${CLAUDE_CONFIG_DIR:-${HOME:-/nonexistent}/.claude}/skills/graphify/SKILL.md" ] \
    && [ ! -f "$root/.claude/skills/graphify/SKILL.md" ]; then
    echo "Companion: graphify is not installed; run: pip install graphifyy==$GRAPHIFY_VERSION && graphify install (the graphify-refresh routine builds graphify-out/ on the graph/ branch with it)."
  fi
fi

# Scheduled workflows: GitHub disables schedule: triggers in a repository idle for 60 days, silently. When gh is
# on PATH, one line per workflow under .github/workflows/ that carries schedule:, with the age of its last
# successful run; a warning when that age exceeds twice the cadence read from the cron line. Silent without gh;
# one line when gh cannot list runs (not logged in). Never blocks.
wfdir="$root/.github/workflows"
if [ -d "$wfdir" ] && command -v gh >/dev/null 2>&1; then
  for wf in "$wfdir"/*.yml "$wfdir"/*.yaml; do
    [ -f "$wf" ] || continue
    grep -q '^[[:space:]]*schedule:' "$wf" || continue
    file="$(basename "$wf")"
    cron="$(sed -n "s/^[[:space:]]*-[[:space:]]*cron:[[:space:]]*['\"]\{0,1\}\([^'\"#]*[^'\"# ]\).*/\1/p" "$wf" | head -1)"
    read -r _cmin chour cdom _cmon cdow <<<"$cron"
    if [ -n "${cdow:-}" ] && [ "$cdow" != "*" ]; then cadence="weekly"; days=7
    elif [ -n "${cdom:-}" ] && [ "$cdom" != "*" ]; then cadence="monthly"; days=30
    elif [ -n "${chour:-}" ] && [ "$chour" != "*" ]; then cadence="daily"; days=1
    else cadence="hourly"; days=1; fi
    if ! last="$(cd "$root" && gh run list --workflow "$file" --status success --limit 1 --json updatedAt --jq '.[0].updatedAt // empty' 2>/dev/null)"; then
      echo "Schedule: gh could not list workflow runs (not logged in, or no actions:read); scheduled-workflow liveness is unchecked."
      break
    fi
    if [ -z "$last" ]; then
      echo "Schedule: $file ($cadence) has no successful run on record; dispatch it (gh workflow run $file) and check it is enabled: GitHub disables schedules after 60 idle days."
      continue
    fi
    age="$(jq -rn --arg t "$last" '($t | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) as $s | ((now - $s) / 86400) | floor' 2>/dev/null || true)"
    if [ -z "$age" ]; then
      echo "Schedule: $file ($cadence) last succeeded at $last."
    elif [ "$age" -gt $((days * 2)) ]; then
      echo "Schedule: $file ($cadence) last succeeded $age days ago, more than twice its cadence; dispatch it (gh workflow run $file) and check it is enabled: GitHub disables schedules after 60 idle days."
    else
      echo "Schedule: $file ($cadence) last succeeded $age days ago."
    fi
  done
fi
exit 0
