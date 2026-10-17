#!/usr/bin/env bash
# .claude/hooks/kit-bootstrap.sh (shopify-app-kit template)
# SessionStart hook, registered by .claude/settings.json. In a remote session the project's marketplace pin
# registers the kit but nothing installs it until `claude plugin install` has run once; this hook does that
# when the kit is absent, installs the official Shopify companion plugin when absent, writes its telemetry
# opt-out, and installs the graphify companion (a pip package plus a user-level skill, pinned to the release
# the kit's doctor names) when absent. A kit already installed (a cloud home can carry an old plugin cache into every
# session) is refreshed: marketplace update, then plugin update, with one line naming the version before and after.
# The refreshed plugin's hooks and skills load from the next session; a sync in this same session copies the vendored
# hooks from the refreshed cache directory and runs that directory's doctor.sh directly. It never fails the session:
# every network step is best-effort and the exit code is always 0. Local sessions are left alone (the maintainer
# installs plugins deliberately).
set -uo pipefail

# The graphify release the kit tested; hooks/doctor.sh in the kit names the same version in its install hint.
GRAPHIFY_VERSION="0.9.65"

[ "${CLAUDE_CODE_REMOTE:-}" = "" ] && exit 0
command -v claude >/dev/null 2>&1 || exit 0

installed="$(claude plugin list 2>/dev/null || true)"

# kit_version: the installed kit's version, from the install path installed_plugins.json records; "unknown" without jq.
kit_version() {
  local f="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/installed_plugins.json" dir v=""
  if command -v jq >/dev/null 2>&1 && [ -f "$f" ]; then
    dir="$(jq -r '(.plugins["shopify-app-kit@shopify-app-kit"] // [])[0].installPath // empty' "$f" 2>/dev/null)"
    [ -z "$dir" ] || v="$(jq -r '.version // empty' "$dir/.claude-plugin/plugin.json" 2>/dev/null)"
  fi
  printf '%s' "${v:-unknown}"
}

if ! grep -q 'shopify-app-kit@shopify-app-kit' <<<"$installed"; then
  claude plugin marketplace add loboroboticos/shopify-app-kit >/dev/null 2>&1 || true
  if claude plugin install -y shopify-app-kit@shopify-app-kit >/dev/null 2>&1; then
    echo "kit-bootstrap: shopify-app-kit installed; its doctor and skills load from the next session (the vendored guards already fire)"
  else
    echo "kit-bootstrap: shopify-app-kit install failed (marketplace unreachable, or the CLI refused); the vendored guards still fire"
  fi
else
  before="$(kit_version)"
  if claude plugin marketplace update shopify-app-kit >/dev/null 2>&1 && claude plugin update -y shopify-app-kit@shopify-app-kit >/dev/null 2>&1; then
    echo "kit-bootstrap: shopify-app-kit $before -> $(kit_version); a newer version loads from the next session"
  else
    echo "kit-bootstrap: shopify-app-kit $before kept (marketplace or plugin update failed); the vendored guards still fire"
  fi
fi

# Where the claude-plugins-official marketplace is not configured (cloud containers ship the built-in directory
# instead), the bare name installs the companion from whichever configured marketplace carries it.
if ! grep -q 'shopify-ai-toolkit' <<<"$installed"; then
  if claude plugin install -y shopify-ai-toolkit@claude-plugins-official >/dev/null 2>&1 || claude plugin install -y shopify-ai-toolkit >/dev/null 2>&1; then
    echo "kit-bootstrap: shopify-ai-toolkit installed; the kit's skills use it from the next session"
  else
    echo "kit-bootstrap: shopify-ai-toolkit install failed (network, or no configured marketplace carries it); the kit's skills work without it"
  fi
fi

# TELEMETRY OPT-OUT: the companion plugin reports usage unless this file exists. Delete this line to opt in.
mkdir -p "$HOME/.config/shopify-ai-toolkit" 2>/dev/null && : > "$HOME/.config/shopify-ai-toolkit/opt-out"

# graphify is not a plugin: its README installs the PyPI package `graphifyy` (the CLI is `graphify`) and then
# `graphify install` writes the skill to ~/.claude/skills/graphify/ (or $CLAUDE_CONFIG_DIR/skills/graphify/).
# Guarded the same way as the Shopify companion: skipped when already present, best-effort, never fatal.
if ! command -v graphify >/dev/null 2>&1 && [ ! -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/graphify/SKILL.md" ]; then
  echo "kit-bootstrap: installing graphify $GRAPHIFY_VERSION"
  if command -v uv >/dev/null 2>&1; then
    uv tool install "graphifyy==$GRAPHIFY_VERSION" >/dev/null 2>&1
  elif command -v pipx >/dev/null 2>&1; then
    pipx install "graphifyy==$GRAPHIFY_VERSION" >/dev/null 2>&1
  else
    python3 -m pip install --quiet "graphifyy==$GRAPHIFY_VERSION" >/dev/null 2>&1
  fi || echo "kit-bootstrap: graphify install failed (network or python?); the graphify-refresh routine will skip"
  if command -v graphify >/dev/null 2>&1; then
    graphify install >/dev/null 2>&1 || echo "kit-bootstrap: graphify install (skill registration) failed"
  fi
fi

exit 0
