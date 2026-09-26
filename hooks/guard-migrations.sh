#!/usr/bin/env bash
# shopify-app-kit v0.15.0
# hooks/guard-migrations.sh: PreToolUse(Bash) guard that keeps destructive Prisma database commands out of an agent
# session, driven by .claude/shopify-app.json (paths.prisma, deploy.scaleToZeroBeforeMigrate, database.*).
#
#   prisma migrate reset                         blocked always (drops and recreates the database)
#   prisma db push --force-reset|--accept-data-loss
#                                                blocked always (drops data to make the schema fit)
#   prisma db execute ... DROP DATABASE|DROP SCHEMA|TRUNCATE
#                                                blocked when the command text carries one of those statements
#   prisma migrate deploy                        allowed; one reminder line on stdout when the manifest sets
#                                                deploy.scaleToZeroBeforeMigrate (a running app swallows webhooks)
#
# Any prefix is seen through: npx / pnpx / bunx, pnpm exec / pnpm dlx, npm exec, yarn [dlx], bun x, a path to the
# binary, or bare prisma. Everything else Prisma (migrate dev, migrate deploy, migrate status, migrate diff,
# migrate resolve, generate, db pull, db seed, studio, a plain db push) passes. A command that only mentions one of
# the guarded forms in prose (a heredoc body, an echo, a commit message) is never blocked. The manifest is read
# only when a guarded form is seen; then a missing manifest or a missing jq fails closed, as the other guards do.
# Vendored into consumers at .claude/hooks/kit/guard-migrations.sh by /shopify-app-kit:sync.
set -uo pipefail

KIT_HOOK_NAME=guard-migrations
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

kit_read_input

lower_input="$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]')"

if ! kit_has_jq; then
  case "$lower_input" in
    *"migrate reset"* | *"--force-reset"* | *"--accept-data-loss"*)
      kit_require_jq "a destructive Prisma command cannot be checked against the manifest" ;;
    *"db execute"*)
      case "$lower_input" in
        *"drop database"* | *"drop schema"* | *truncate*) kit_require_jq "a destructive Prisma command cannot be checked against the manifest" ;;
      esac ;;
  esac
  exit 0
fi

kit_parse_input
case "$cmd" in *prisma*) ;; *) exit 0 ;; esac

lower_cmd="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"

prisma_path=""
provider=""
shared_dev=""
scale_to_zero=""
RULE=""

# ensure_manifest: read the database facts the first time a guarded form is seen (lib.sh fails closed when the
# manifest is missing); the block message then names them.
ensure_manifest() {
  kit_ensure_manifest || return 0
  prisma_path="$(mf '.paths.prisma // "prisma"')"
  provider="$(mf '.database.provider // "unknown"')"
  shared_dev="$(mf '.database.sharedDevDbWithBeta // false')"
  scale_to_zero="$(mf '.deploy.scaleToZeroBeforeMigrate // false')"
  RULE="Destructive Prisma commands never run from an agent session: the database this checkout reaches may be shared or production (per .claude/shopify-app.json: database.provider $provider, database.sharedDevDbWithBeta $shared_dev, migrations under $prisma_path). Write a forward-only migration and apply it with prisma migrate deploy through the branch; a local-only reset is the maintainer's to run (skills/release/references/migrations-and-zero-downtime.md)."
}

# manifest_read_or_skip: for the allowed migrate deploy reminder only; a missing manifest means no reminder, never a block.
manifest_read_or_skip() {
  [ "$manifest_loaded" -eq 1 ] && return 0
  kit_resolve_manifest "$cwd"
  kit_manifest_ok || return 1
  scale_to_zero="$(mf '.deploy.scaleToZeroBeforeMigrate // false')"
  manifest_loaded=1
}

# check_prisma ARGS...: ARGS start after the prisma program word.
check_prisma() {
  local sub="${1:-}" verb="${2:-}" a
  case "$sub $verb" in
    "migrate reset")
      ensure_manifest
      block "prisma migrate reset drops and recreates the database (${words[*]})" "$RULE" ;;
    "db push")
      shift 2
      for a in "$@"; do
        case "$a" in
          --force-reset | --accept-data-loss)
            ensure_manifest
            block "prisma db push $a drops data to make the schema fit (${words[*]})" "$RULE" ;;
        esac
      done ;;
    "db execute")
      case "$lower_cmd" in
        *"drop database"* | *"drop schema"* | *truncate*)
          ensure_manifest
          block "prisma db execute with a DROP DATABASE, DROP SCHEMA or TRUNCATE statement (${words[*]})" "$RULE" ;;
      esac ;;
    "migrate deploy")
      if manifest_read_or_skip && [ "$scale_to_zero" = true ]; then
        echo "shopify-app-kit/guard-migrations: deploy.scaleToZeroBeforeMigrate is true in .claude/shopify-app.json; scale the app to zero before prisma migrate deploy and back up after, or a running instance swallows webhook deliveries mid-migration (release skill: references/migrations-and-zero-downtime.md)."
      fi ;;
  esac
}

on_command() {
  local dir="$1" prog
  shift
  words=("$@")
  prog="${1##*/}"
  shift
  case "$prog" in
    prisma) check_prisma "$@" ;;
    npm | pnpm | yarn | bun)
      # pnpm exec prisma, pnpm dlx prisma, npm exec [--] prisma, yarn [dlx] prisma, bun x prisma; flags between are skipped.
      while [ $# -gt 0 ]; do
        case "$1" in
          exec | dlx | x | --) shift ;;
          -*) shift ;;
          *) break ;;
        esac
      done
      [ "${1##*/}" = prisma ] || return 0
      shift
      check_prisma "$@" ;;
  esac
  return 0
}

declare -a words=()
kit_walk_commands "$cmd" on_command
exit 0
