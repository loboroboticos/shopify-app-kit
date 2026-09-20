# Changelog

All notable changes to shopify-app-kit. The version is the plugin version in `.claude-plugin/plugin.json`; every
vendored hook carries it on line 2 (`# shopify-app-kit vX.Y.Z`).

## 0.1.0

First release: skeleton, schema, one guard, doctor, tests, CI.

- Plugin skeleton: `.claude-plugin/plugin.json`, its own marketplace (`.claude-plugin/marketplace.json`,
  source `./`), `hooks/hooks.json` registering only the SessionStart doctor.
- Manifest schema v1 (`schemas/shopify-app.v1.schema.json`, draft 2020-12): closed top level, additive sections,
  policy enums for `shopifyCli`, `configs.*` required when the matching policy is `config-required`.
- `hooks/lib.sh`: manifest resolution (`$SHOPIFY_APP_KIT_MANIFEST`, `$CLAUDE_PROJECT_DIR`, walk up from cwd),
  consumer-root derivation, `block()`, path helpers, heredoc stripping, control-operator splitting and `cd`
  tracking, exposed as `kit_walk_commands`.
- `hooks/guard-shopify-cli.sh`: `app dev` per `devPolicy`, `app deploy` per `deployPolicy`, `app config use` per
  `configUsePolicy`, `<pm> run deploy` blocked unless deploy is `allowed`, `theme dev` from the repo root per
  `themeDevFromRoot`. `config-required` also checks that the `--config` value equals the manifest's config.
  Fails closed without jq, without a manifest, or after a `cd` to a non-literal path.
- `hooks/doctor.sh`: SessionStart briefing with a jq structural validation, app facts, vendored-hook and settings
  drift; never exits non-zero; silent without a manifest.
- Skills: `doctor`, `sync` (user-invoked), `kit-dev` (user-invoked).
- Tests (node:test, zero dependencies): hook case table over two fixture manifests, schema fixtures and mutants,
  skill frontmatter parity, and a repo-literal tripwire.
- CI: tests, `claude plugin validate . --strict` when the CLI installs, version-bump check on PRs to `main`.
