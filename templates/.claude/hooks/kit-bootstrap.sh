#!/usr/bin/env bash
# .claude/hooks/kit-bootstrap.sh (shopify-app-kit template)
# SessionStart hook, registered by .claude/settings.json. In a remote session the project's marketplace pin
# registers the kit but nothing installs it until `claude plugin install` has run once; this hook does that
# when the kit is absent, installs the official Shopify companion plugin when absent, and writes its telemetry
# opt-out. It never fails the session: every network step is best-effort and the exit code is always 0.
# Local sessions are left alone (the maintainer installs plugins deliberately).
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "" ] && exit 0
command -v claude >/dev/null 2>&1 || exit 0

installed="$(claude plugin list 2>/dev/null || true)"

if ! grep -q 'shopify-app-kit' <<<"$installed"; then
  echo "kit-bootstrap: installing shopify-app-kit"
  claude plugin marketplace add loboroboticos/shopify-app-kit >/dev/null 2>&1 || echo "kit-bootstrap: marketplace add failed (network?); the vendored guards still fire"
  claude plugin install shopify-app-kit@shopify-app-kit >/dev/null 2>&1 || echo "kit-bootstrap: plugin install failed (network?); the vendored guards still fire"
fi

if ! grep -q 'shopify-ai-toolkit' <<<"$installed"; then
  echo "kit-bootstrap: installing shopify-ai-toolkit"
  claude plugin install shopify-ai-toolkit@claude-plugins-official >/dev/null 2>&1 || echo "kit-bootstrap: shopify-ai-toolkit install failed (network?)"
fi

# TELEMETRY OPT-OUT: the companion plugin reports usage unless this file exists. Delete this line to opt in.
mkdir -p "$HOME/.config/shopify-ai-toolkit" 2>/dev/null && : > "$HOME/.config/shopify-ai-toolkit/opt-out"

exit 0
